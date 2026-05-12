import { pathToFileURL } from "node:url";
import { loadConfig, loadSearches } from "./config.js";
import { createListingProvider, type ListingProvider } from "./provider.js";
import { DealStore, type DealStoreApi } from "./store.js";
import { DiscordWebhook } from "./discord.js";
import { scoreListings } from "./scoring.js";
import type { Listing, ScoredDeal } from "./types.js";
import type { ScoringOptions } from "./scoring.js";
import type { AlertDeliveryOptions } from "./dashboardTypes.js";
import type { DashboardStore } from "./dashboardStore.js";

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const config = loadConfig();
  const searches = loadSearches(config.maxProductsPerScan);
  const provider = createListingProvider(config);
  const store = await DealStore.open(config.databasePath);
  const discord = new DiscordWebhook(config);
  let scanInFlight = false;
  let scanCount = 0;

  const runGuardedScan = async (): Promise<void> => {
    if (scanInFlight) {
      console.warn("[scan] ignoré car le scan précédent est encore en cours");
      return;
    }

    scanInFlight = true;
    try {
      const result = await runScan({ provider, store, discord, searches });
      scanCount += 1;
      if (!once && config.heartbeatEveryScans > 0 && scanCount % config.heartbeatEveryScans === 0) {
        await discord.sendStatus(
          `Le bot Vinted fonctionne. Dernier scan : ${result.listings} annonces, ${result.alertable} alertables, ${result.sent} envoyées. Meilleur candidat : ${result.bestCandidate}.`
        );
      }
    } finally {
      scanInFlight = false;
    }
  };

  if (config.runOnStart || once) {
    await runGuardedScan();
  }

  if (once) return;

  const intervalMs = config.pollIntervalSeconds * 1000;
  setInterval(() => {
    runGuardedScan().catch((error) => {
      console.error(`[scan] ${error instanceof Error ? error.stack : String(error)}`);
      discord.sendStatus(`Scan du bot Vinted échoué : ${error instanceof Error ? error.message : String(error)}`).catch((statusError) => {
        console.error(`[status] ${statusError instanceof Error ? statusError.stack : String(statusError)}`);
      });
    });
  }, intervalMs);
}

export async function runScan({
  provider,
  store,
  discord,
  searches,
  scoringOptions,
  delivery,
  scanRunId,
  dashboardStore,
  userId,
  now = () => new Date()
}: {
  provider: Pick<ListingProvider, "search">;
  store: Pick<DealStoreApi, "recentHistory" | "saveObserved" | "reserveAlert" | "recordAlert" | "releaseAlert" | "alertsInLast24h">;
  discord: Pick<DiscordWebhook, "sendDeal">;
  searches: Parameters<ListingProvider["search"]>[0][];
  scoringOptions?: ScoringOptions;
  delivery?: AlertDeliveryOptions;
  scanRunId?: number;
  dashboardStore?: Pick<DashboardStore, "recordDealCandidates" | "log">;
  /**
   * Owner of this scan. Threads through to recordDealCandidates and log so
   * each row is properly scoped. Defaults to 1 (seed admin) when omitted —
   * preserves single-tenant CLI usage (`npm run once`).
   */
  userId?: number;
  /** Injectable clock for testing quiet-hours logic. */
  now?: () => Date;
}): Promise<{ listings: number; scored: number; alertable: number; sent: number; bestCandidate: string }> {
  const allListings: Listing[] = [];

  for (const search of searches) {
    const listings = await provider.search(search);
    allListings.push(...listings);
  }

  const uniqueListings = dedupeById(allListings);
  const history = await store.recentHistory();
  const scored = scoreListings(uniqueListings, history, scoringOptions);

  for (const deal of scored) {
    if (!deal.risks.some((risk) => risk.severity === "reject" || risk.severity === "high")) {
      await store.saveObserved(deal.listing, deal.match);
    }
  }

  const dropPercent = delivery?.reAlertDropPercent;
  const maxPerScan = delivery?.maxAlertsPerScan ?? 0;
  const maxPerDay = delivery?.maxAlertsPerDay ?? 0;
  const inQuietHours = isInQuietHours(delivery, now());
  // All alert-state operations are scoped to the user owning this scan.
  // Default to seed admin (id=1) preserves single-tenant CLI behavior.
  const scanUserId = userId ?? 1;
  const startingDailyAlerts = maxPerDay > 0 ? await store.alertsInLast24h(scanUserId) : 0;
  let sentAlerts = 0;
  const sentListingIds = new Set<string>();

  for (const deal of scored.filter((item) => item.shouldAlert)) {
    if (maxPerScan > 0 && sentAlerts >= maxPerScan) {
      await dashboardStore?.log("warn", `Plafond par scan atteint (${maxPerScan}). Alertes restantes différées.`, userId);
      break;
    }
    if (maxPerDay > 0 && startingDailyAlerts + sentAlerts >= maxPerDay) {
      await dashboardStore?.log("warn", `Plafond journalier atteint (${maxPerDay}). Alertes restantes différées.`, userId);
      break;
    }
    if (inQuietHours) {
      await dashboardStore?.log("info", `Heures calmes : alerte ${deal.match.model} reportée. Visible dans le tableau.`, userId);
      continue;
    }
    if (!(await store.reserveAlert(deal, dropPercent, scanUserId))) continue;

    try {
      await discord.sendDeal(deal);
      await store.recordAlert(deal, scanUserId);
      sentListingIds.add(deal.listing.id);
      sentAlerts += 1;
      console.log(`[alerte] ${deal.match.model} ${Math.round(deal.finalPrice)} EUR final score=${deal.score} url=${deal.listing.url}`);
    } catch (error) {
      await store.releaseAlert(deal, scanUserId);
      throw error;
    }
  }

  const alertable = scored.filter((item) => item.shouldAlert).length;
  const bestCandidate = scored[0] ? candidateSummary(scored[0]) : "aucun";
  await dashboardStore?.recordDealCandidates(scanRunId, scored, sentListingIds, userId);
  console.log(`[scan] annonces=${uniqueListings.length} scorées=${scored.length} alertables=${alertable} envoyées=${sentAlerts} meilleur=${bestCandidate}`);
  return { listings: uniqueListings.length, scored: scored.length, alertable, sent: sentAlerts, bestCandidate };
}

/**
 * Returns true if `clock` is inside the quiet-hours window.
 * Window can wrap past midnight: start=23:00 end=08:00 covers 23:00–07:59.
 * Equal start/end means "always quiet" — flagged but harmless because the
 * dashboard exposes an explicit enabled flag.
 */
export function isInQuietHours(delivery: AlertDeliveryOptions | undefined, clock: Date): boolean {
  if (!delivery?.quietHoursEnabled) return false;
  const startMin = parseHHMM(delivery.quietHoursStart);
  const endMin = parseHHMM(delivery.quietHoursEnd);
  if (startMin === null || endMin === null) return false;
  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  if (startMin === endMin) return true;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  // Wraps past midnight.
  return nowMin >= startMin || nowMin < endMin;
}

function parseHHMM(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match || !match[1] || !match[2]) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function dedupeById(listings: Listing[]): Listing[] {
  const byId = new Map<string, Listing>();
  for (const listing of listings) byId.set(listing.id, listing);
  return [...byId.values()];
}

function candidateSummary(deal: ScoredDeal): string {
  const riskSummary = deal.risks.length ? `${deal.risks.length} notes de risque` : "propre";
  return `${deal.match.model} ${Math.round(deal.finalPrice)} EUR final, score ${deal.score}, ${riskSummary}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
