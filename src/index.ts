import { pathToFileURL } from "node:url";
import { loadConfig, loadSearches } from "./config.js";
import { createListingProvider, type ListingProvider } from "./provider.js";
import { DealStore, type DealStoreApi } from "./store.js";
import { DiscordWebhook } from "./discord.js";
import { scoreListings } from "./scoring.js";
import type { Listing, ScoredDeal } from "./types.js";
import type { ScoringOptions } from "./scoring.js";
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
      console.warn("[scan] skipped because previous scan is still running");
      return;
    }

    scanInFlight = true;
    try {
      const result = await runScan({ provider, store, discord, searches });
      scanCount += 1;
      if (!once && config.heartbeatEveryScans > 0 && scanCount % config.heartbeatEveryScans === 0) {
        await discord.sendStatus(
          `Vinted bot is running. Last scan: ${result.listings} listings, ${result.alertable} alertable, ${result.sent} sent. Best candidate: ${result.bestCandidate}.`
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
      discord.sendStatus(`Vinted bot scan failed: ${error instanceof Error ? error.message : String(error)}`).catch((statusError) => {
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
  scanRunId,
  dashboardStore
}: {
  provider: Pick<ListingProvider, "search">;
  store: Pick<DealStoreApi, "recentHistory" | "saveObserved" | "reserveAlert" | "recordAlert" | "releaseAlert">;
  discord: Pick<DiscordWebhook, "sendDeal">;
  searches: Parameters<ListingProvider["search"]>[0][];
  scoringOptions?: ScoringOptions;
  scanRunId?: number;
  dashboardStore?: Pick<DashboardStore, "recordDealCandidates">;
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

  let sentAlerts = 0;
  const sentListingIds = new Set<string>();
  for (const deal of scored.filter((item) => item.shouldAlert)) {
    if (!(await store.reserveAlert(deal))) continue;

    try {
      await discord.sendDeal(deal);
      await store.recordAlert(deal);
      sentListingIds.add(deal.listing.id);
      sentAlerts += 1;
      console.log(`[alert] ${deal.match.model} ${Math.round(deal.finalPrice)} EUR final score=${deal.score} url=${deal.listing.url}`);
    } catch (error) {
      await store.releaseAlert(deal);
      throw error;
    }
  }

  const alertable = scored.filter((item) => item.shouldAlert).length;
  const bestCandidate = scored[0] ? candidateSummary(scored[0]) : "none";
  await dashboardStore?.recordDealCandidates(scanRunId, scored, sentListingIds);
  console.log(`[scan] listings=${uniqueListings.length} scored=${scored.length} alertable=${alertable} sent=${sentAlerts} best=${bestCandidate}`);
  return { listings: uniqueListings.length, scored: scored.length, alertable, sent: sentAlerts, bestCandidate };
}

function dedupeById(listings: Listing[]): Listing[] {
  const byId = new Map<string, Listing>();
  for (const listing of listings) byId.set(listing.id, listing);
  return [...byId.values()];
}

function candidateSummary(deal: ScoredDeal): string {
  const riskSummary = deal.risks.length ? `${deal.risks.length} risk notes` : "clean";
  return `${deal.match.model} ${Math.round(deal.finalPrice)} EUR final, score ${deal.score}, ${riskSummary}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
