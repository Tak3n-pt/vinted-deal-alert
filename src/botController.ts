import { CachedListingProvider, SearchResultCache, createListingProvider, providerCacheNamespace } from "./provider.js";
import { DiscordDeliverer, DiscordWebhook } from "./discord.js";
import { runScan } from "./index.js";
import type { DealStore } from "./store.js";
import type { Listing, RuntimeConfig, SearchConfig } from "./types.js";
import type { DealCandidateRecord, ScanRunRecord, User, UserSettings } from "./dashboardTypes.js";
import { DashboardStore } from "./dashboardStore.js";
import { scoreListings } from "./scoring.js";

export interface BotStatus {
  running: boolean;
  paused: boolean;
  scanInFlight: boolean;
  nextScanAt?: string;
  lastScan?: ScanRunRecord;
  bestCandidate?: DealCandidateRecord;
}

// Retention caps are now applied per-user. Each value represents the per-user
// keep size, not the global table size. Bumped logs to 5000 since a single
// scan tick can emit ~10 log rows and the previous 2000 cap covered <1 week.
const RETENTION_DEAL_CANDIDATES_DEFAULT = 5000;
const RETENTION_LOGS_DEFAULT = 5000;
const RETENTION_SCAN_RUNS_DEFAULT = 2000;

export class BotController {
  private paused = false;
  private scanInFlight = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextScanAt: Date | undefined;
  private started = false;
  private scheduledScanCount = 0;
  private readonly nextUserScanAt = new Map<number, number>();
  private lastPriceRecheckAt = 0;

  constructor(
    private readonly baseConfig: RuntimeConfig,
    private readonly fallbackSearches: SearchConfig[],
    private readonly dealStore: DealStore,
    private readonly dashboardStore: DashboardStore
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const snapshot = await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches);
    if (snapshot.config.runOnStart) {
      this.guardedScan("startup").catch((error) => {
        this.dashboardStore.log("error", `Scan au démarrage échoué : ${messageFromError(error)}`).catch((logError) => {
          console.error(`[dashboard] ${messageFromError(logError)}`);
        });
      });
    }
    this.scheduleNext(await this.nextSchedulerDelaySeconds(snapshot.config.pollIntervalSeconds));
  }

  async scanNow(): Promise<ScanRunRecord | undefined> {
    await this.guardedScan("manual");
    return (await this.status()).lastScan;
  }

  async pause(): Promise<BotStatus> {
    this.paused = true;
    this.clearTimer();
    await this.dashboardStore.log("warn", "Bot mis en pause depuis le dashboard");
    return this.status();
  }

  async resume(): Promise<BotStatus> {
    this.paused = false;
    await this.dashboardStore.log("info", "Bot relancé depuis le dashboard");
    this.scheduleNext(1);
    return this.status();
  }

  async status(userId = 1): Promise<BotStatus> {
    const scans = await this.dashboardStore.listScanRuns(1, userId);
    const candidates = await this.dashboardStore.listDealCandidates(1, userId);
    const status: BotStatus = {
      running: this.started && !this.paused,
      paused: this.paused,
      scanInFlight: this.scanInFlight
    };
    if (this.nextScanAt) status.nextScanAt = this.nextScanAt.toISOString();
    if (scans[0]) status.lastScan = scans[0];
    if (candidates[0]) status.bestCandidate = candidates[0];
    return status;
  }

  async testDiscord(): Promise<void> {
    const snapshot = await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches);
    await new DiscordWebhook(snapshot.config).sendStatus("Test du dashboard Vinted Deal Alert.");
    await this.dashboardStore.log("info", "Message de test Discord envoyé");
  }

  private async guardedScan(source: ScanRunRecord["source"]): Promise<void> {
    if (this.scanInFlight) {
      await this.dashboardStore.log("warn", "Scan ignoré : un autre scan est déjà en cours");
      return;
    }
    if (this.paused && source === "scheduled") {
      await this.dashboardStore.log("warn", "Scan planifié ignoré : le bot est en pause");
      return;
    }

    this.scanInFlight = true;
    const searchCache = new SearchResultCache();
    try {
      const users = await this.dashboardStore.listActiveUsers();
      if (users.length === 0) {
        await this.dashboardStore.log("info", "Aucun utilisateur actif — scan ignoré");
        return;
      }
      const startedAt = Date.now();
      const globalIntervalSeconds = (await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches)).config.pollIntervalSeconds;
      // Sequential per-user scans. Parallelizing would multiply Apify spend
      // and risk rate limits — V1 trades latency for cost predictability.
      for (const user of users) {
        const userSettings = await this.dashboardStore.getUserSettings(user.id);
        if (source === "scheduled" && !this.isUserScanDue(user.id, startedAt)) {
          continue;
        }
        try {
          await this.scanForUser(user, source, searchCache);
        } catch (error) {
          // Per-user errors are isolated — one failure shouldn't block others
          await this.dashboardStore.log(
            "error",
            `Scan utilisateur échoué : ${messageFromError(error)}`,
            user.id
          ).catch(() => undefined);
        } finally {
          this.markUserScanned(user.id, userSettings, globalIntervalSeconds);
        }
      }
      if (searchCache.stats.hits > 0) {
        console.log(`[scan-cache] recherches réutilisées=${searchCache.stats.hits} appels provider=${searchCache.stats.misses}`);
      }
    } finally {
      this.scanInFlight = false;
      // Best-effort retention prune after every scan tick, regardless of outcome.
      try {
        await this.dashboardStore.pruneRetention({
          dealCandidatesKeep: RETENTION_DEAL_CANDIDATES_DEFAULT,
          logsKeep: RETENTION_LOGS_DEFAULT,
          scanRunsKeep: RETENTION_SCAN_RUNS_DEFAULT
        });
      } catch (pruneError) {
        console.error(`[retention] ${messageFromError(pruneError)}`);
      }
      // Price-recheck cycle — only fires when interval has elapsed since last run
      const recheckIntervalMs = intFromEnv("PRICE_RECHECK_INTERVAL_SECONDS", 14400) * 1000;
      if (Date.now() - this.lastPriceRecheckAt >= recheckIntervalMs) {
        this.lastPriceRecheckAt = Date.now();
        try {
          await this.runPriceRecheck();
        } catch (recheckError) {
          await this.dashboardStore.log("error", `Price-recheck échoué : ${messageFromError(recheckError)}`).catch(() => undefined);
        }
      }
    }
  }

  /**
   * Re-fetch detail pages for previously-observed listings that fell off
   * newest_first results. Detects price drops on second-chance deals.
   */
  private async runPriceRecheck(): Promise<void> {
    const users = await this.dashboardStore.listActiveUsers();
    if (users.length === 0) return;

    const count = intFromEnv("PRICE_RECHECK_COUNT", 5);
    const freshenedHoursAgo = Math.max(1, Math.floor(intFromEnv("PRICE_RECHECK_INTERVAL_SECONDS", 14400) / 3600));
    const maxObservedAgeHours = intFromEnv("PRICE_RECHECK_MAX_AGE_HOURS", 72);
    const minDropRatio = 0.10;

    const botToken = (process.env.DISCORD_BOT_TOKEN ?? "").trim() || null;
    for (const user of users) {
      // Skip users with no delivery channel available. DM works when the user
      // has a Discord ID (collected at OAuth login) and the bot token is set;
      // webhook is the legacy fallback for users who haven't re-authed.
      const webhookUrl = await this.dashboardStore.getDecryptedWebhook(user.id);
      const adminWebhookFallback = !webhookUrl && user.id === 1 ? (this.baseConfig.discordWebhookUrl || null) : null;
      const effectiveWebhook = webhookUrl ?? adminWebhookFallback;
      const canDM = Boolean(user.discordId && botToken);
      if (!effectiveWebhook && !canDM) continue;

      // Quota gate. Recheck previously bypassed this, letting users go ~30
      // calls/day above their daily Apify limit. Skip if exhausted.
      const used = await this.dashboardStore.getDailyUsage(user.id);
      const remaining = Math.max(0, user.dailyApifyQuota - used);
      if (remaining <= 0) continue;

      const candidates = await this.dealStore.listingsForPriceRecheck(
        user.id, Math.min(count, remaining), freshenedHoursAgo, maxObservedAgeHours
      );
      if (candidates.length === 0) continue;

      const snapshot = await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches, user.id);
      const userConfig: RuntimeConfig = { ...snapshot.config, discordWebhookUrl: effectiveWebhook ?? "" };
      const provider = createListingProvider(userConfig);
      if (typeof provider.fetchListingDetails !== "function") continue;

      let detailed: Listing[];
      try {
        detailed = await provider.fetchListingDetails(candidates.map((c) => c.url));
      } catch (error) {
        await this.dashboardStore.log("warn", `recheck fetch détail échoué : ${messageFromError(error)}`, user.id).catch(() => undefined);
        continue;
      }

      const history = await this.dealStore.recentHistory();
      const scored = scoreListings(detailed, history, snapshot.scoringOptions);
      const discord = new DiscordDeliverer({
        discordUserId: user.discordId || null,
        webhookUrl: effectiveWebhook,
        botToken,
        dryRun: userConfig.dryRun,
      });

      // Mark every candidate as checked, even ones the detail actor didn't
      // return (likely sold/deleted). Without this, dead listings stay in the
      // recheck pool forever and burn credit every 4 h.
      const detailedIds = new Set(detailed.map((d) => d.id));
      for (const candidate of candidates) {
        if (!detailedIds.has(candidate.id)) {
          await this.dealStore.recordPriceRecheck(candidate.id, candidate.storedPrice);
        }
      }

      let alertedCount = 0;
      let droppedCount = 0;
      for (const deal of scored) {
        const candidate = candidates.find((c) => c.id === deal.listing.id);
        if (!candidate) continue;
        await this.dealStore.recordPriceRecheck(deal.listing.id, deal.finalPrice);
        const dropRatio = (candidate.storedPrice - deal.finalPrice) / candidate.storedPrice;
        if (dropRatio < minDropRatio) continue;
        if (!deal.shouldAlert) continue;
        droppedCount += 1;
        const reserved = await this.dealStore.reserveAlert(deal, 0.10, user.id);
        if (!reserved) continue;
        try {
          const dropReason = `Baisse de prix ${Math.round(dropRatio * 100)}% détectée (${Math.round(candidate.storedPrice)}€ vers ${Math.round(deal.finalPrice)}€)`;
          const enrichedDeal = { ...deal, reasons: [dropReason, ...deal.reasons] };
          await discord.sendDeal(enrichedDeal);
          await this.dealStore.recordAlert(deal, user.id);
          alertedCount += 1;
        } catch (sendError) {
          await this.dealStore.releaseAlert(deal, user.id);
          await this.dashboardStore.log("warn", `recheck envoi alerte échoué : ${messageFromError(sendError)}`, user.id).catch(() => undefined);
        }
      }
      if (candidates.length > 0) {
        console.log(`[recheck] user=${user.id} candidates=${candidates.length} prix-baissés=${droppedCount} alertes=${alertedCount}`);
        // Count recheck Apify calls against the user's daily quota so they
        // can't silently exceed plan limits via the recheck path.
        await this.dashboardStore.recordUsage(user.id, candidates.length).catch(() => undefined);
      }
    }
  }

  /**
   * Run a scan for one specific user. Skips quota-exceeded users and users
   * without a webhook. Records usage_log on success.
   */
  private async scanForUser(user: User, source: ScanRunRecord["source"], searchCache: SearchResultCache): Promise<void> {
    // Quota gate
    const used = await this.dashboardStore.getDailyUsage(user.id);
    const quotaRemaining = Math.max(0, user.dailyApifyQuota - used);
    if (quotaRemaining <= 0) {
      await this.dashboardStore.log(
        "warn",
        `Quota journalier atteint (${used}/${user.dailyApifyQuota} produits). Scan reporté à demain.`,
        user.id
      );
      return;
    }

    const snapshot = await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches, user.id);

    // Delivery resolution. Prefer DM (requires Discord ID + bot token + user
    // sharing the Hub guild); fall back to user-configured webhook. Seed admin
    // also falls back to env's DISCORD_WEBHOOK_URL for legacy compatibility.
    let webhookUrl = await this.dashboardStore.getDecryptedWebhook(user.id);
    if (!webhookUrl && user.id === 1) webhookUrl = this.baseConfig.discordWebhookUrl || null;
    const botToken = (process.env.DISCORD_BOT_TOKEN ?? "").trim() || null;
    const canDM = Boolean(user.discordId && botToken);
    if (!webhookUrl && !canDM && !snapshot.config.dryRun) {
      await this.dashboardStore.log("warn", "Aucun canal Discord disponible (DM ou webhook) — scan ignoré", user.id);
      return;
    }

    // Rotation: pick up to N searches (N = floor(MAX_PRODUCTS_PER_SCAN/10))
    // oldest-polled-first. Users can enable many phones; the bot scans a slice
    // each tick and rotates fairly. We mark searches polled AFTER the scan
    // succeeds — a failed scan must retry the same slice next tick.
    const { searches: rotatedSearches, ids: rotatedIds } = await this.dashboardStore.getSearchesForScan(
      user.id,
      Math.min(snapshot.config.maxProductsPerScan, quotaRemaining)
    );
    if (rotatedSearches.length === 0) {
      await this.dashboardStore.log("info", "Aucune recherche active — scan ignoré", user.id);
      return;
    }

    // Override the shared snapshot's webhook with this user's
    const userConfig: RuntimeConfig = { ...snapshot.config, discordWebhookUrl: webhookUrl ?? "" };
    const runId = await this.dashboardStore.startScanRun(source, rotatedSearches.length, user.id);
    let result: { listings: number; scored: number; alertable: number; sent: number; bestCandidate: string; borderlineVerified?: number } | null = null;
    try {
      const provider = new CachedListingProvider(
        createListingProvider(userConfig),
        searchCache,
        providerCacheNamespace(userConfig)
      );
      const discord = new DiscordDeliverer({
        discordUserId: user.discordId || null,
        webhookUrl: webhookUrl ?? null,
        botToken,
        dryRun: userConfig.dryRun,
      });
      result = await runScan({
        provider,
        store: this.dealStore,
        discord,
        searches: rotatedSearches,
        scoringOptions: snapshot.scoringOptions,
        delivery: snapshot.delivery,
        scanRunId: runId,
        dashboardStore: this.dashboardStore,
        userId: user.id
      });
      await this.dashboardStore.markSearchesPolled(rotatedIds);
      await this.dashboardStore.completeScanRun(runId, "success", result, undefined, user.id);

      // Heartbeat — owner only (id=1), scheduled scans only. Counter
      // increments only on the owner's scan so it doesn't accelerate with
      // additional paying users.
      if (source === "scheduled" && user.id === 1) {
        this.scheduledScanCount += 1;
        if (
          userConfig.heartbeatEveryScans > 0 &&
          this.scheduledScanCount % userConfig.heartbeatEveryScans === 0
        ) {
          await discord.sendStatus(
            `Le bot Vinted fonctionne. Dernier scan : ${result.listings} annonces, ${result.alertable} alertables, ${result.sent} envoyées. Meilleur candidat : ${result.bestCandidate}.`
          );
        }
      }
    } catch (error) {
      await this.dashboardStore.completeScanRun(
        runId,
        "failed",
        result ?? { listings: 0, scored: 0, alertable: 0, sent: 0, bestCandidate: "aucun" },
        messageFromError(error),
        user.id
      );
      throw error;
    } finally {
      // Always charge the quota for whatever was actually fetched, even on
      // partial failure. Without this, a flapping endpoint could let a single
      // user spend 5× their daily Apify credit retrying.
      if (result && result.listings > 0) {
        const total = result.listings + (result.borderlineVerified ?? 0);
        await this.dashboardStore.recordUsage(user.id, total).catch(() => undefined);
      }
    }
  }

  private scheduleNext(delaySeconds: number): void {
    this.clearTimer();
    if (this.paused) return;
    const delayMs = Math.max(1, delaySeconds) * 1000;
    this.nextScanAt = new Date(Date.now() + delayMs);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.nextScanAt = undefined;
      this.guardedScan("scheduled")
        .catch((error) => {
          this.dashboardStore.log("error", `Scan planifié échoué : ${messageFromError(error)}`).catch((logError) => {
            console.error(`[dashboard] ${messageFromError(logError)}`);
          });
        })
        .finally(async () => {
          this.scheduleNext(await this.nextSchedulerDelaySeconds());
        });
    }, delayMs);
  }

  private isUserScanDue(userId: number, nowMs: number): boolean {
    const dueAt = this.nextUserScanAt.get(userId);
    return dueAt === undefined || dueAt <= nowMs;
  }

  private markUserScanned(userId: number, settings: UserSettings, globalIntervalSeconds: number): void {
    this.nextUserScanAt.set(userId, Date.now() + this.effectiveUserIntervalSeconds(userId, settings, globalIntervalSeconds) * 1000);
  }

  private async nextSchedulerDelaySeconds(fallback?: number): Promise<number> {
    const dayDefault = fallback ?? (await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches)).config.pollIntervalSeconds;
    const globalInterval = timeWindowIntervalSeconds(dayDefault);
    const users = await this.dashboardStore.listActiveUsers();
    if (users.length === 0) return globalInterval;

    const intervals = await Promise.all(
      users.map(async (user) => this.effectiveUserIntervalSeconds(user.id, await this.dashboardStore.getUserSettings(user.id), globalInterval))
    );
    return Math.min(globalInterval, ...intervals);
  }

  private effectiveUserIntervalSeconds(userId: number, settings: UserSettings, globalIntervalSeconds: number): number {
    // Apply the peak/off-peak time-window to every user, not just admin.
    // Paying users get the 15-min peak boost (18-23h Europe/Paris) and the
    // 60-min off-peak slowdown overnight, anchored to their own configured
    // base cadence (defaults to 1800s = 30 min).
    const base = userId === 1 ? globalIntervalSeconds : settings.pollIntervalSeconds;
    return Math.max(60, timeWindowIntervalSeconds(base));
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.nextScanAt = undefined;
  }
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function intFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function currentParisHour(): number {
  return Number(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hour12: false
    }).format(new Date())
  );
}

function timeWindowIntervalSeconds(dayDefault: number): number {
  const hour = currentParisHour();
  const peakStart = intFromEnv("PEAK_HOURS_START", 18);
  const peakEnd = intFromEnv("PEAK_HOURS_END", 23);
  const offpeakStart = intFromEnv("OFFPEAK_HOURS_START", 23);
  const offpeakEnd = intFromEnv("OFFPEAK_HOURS_END", 7);
  if (hour >= peakStart && hour < peakEnd) {
    return intFromEnv("PEAK_POLL_INTERVAL_SECONDS", 900);
  }
  const offpeak = offpeakStart < offpeakEnd
    ? hour >= offpeakStart && hour < offpeakEnd
    : hour >= offpeakStart || hour < offpeakEnd;
  if (offpeak) {
    return intFromEnv("OFFPEAK_POLL_INTERVAL_SECONDS", 3600);
  }
  return dayDefault;
}
