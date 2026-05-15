import { CachedListingProvider, SearchResultCache, createListingProvider, providerCacheNamespace } from "./provider.js";
import { DiscordWebhook } from "./discord.js";
import { runScan } from "./index.js";
import type { DealStore } from "./store.js";
import type { RuntimeConfig, SearchConfig } from "./types.js";
import type { DealCandidateRecord, ScanRunRecord, User, UserSettings } from "./dashboardTypes.js";
import { DashboardStore } from "./dashboardStore.js";

export interface BotStatus {
  running: boolean;
  paused: boolean;
  scanInFlight: boolean;
  nextScanAt?: string;
  lastScan?: ScanRunRecord;
  bestCandidate?: DealCandidateRecord;
}

const RETENTION_DEAL_CANDIDATES_DEFAULT = 5000;
const RETENTION_LOGS_DEFAULT = 2000;
const RETENTION_SCAN_RUNS_DEFAULT = 1000;

export class BotController {
  private paused = false;
  private scanInFlight = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextScanAt: Date | undefined;
  private started = false;
  private scheduledScanCount = 0;
  private readonly nextUserScanAt = new Map<number, number>();

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

  async status(): Promise<BotStatus> {
    const scans = await this.dashboardStore.listScanRuns(1);
    const candidates = await this.dashboardStore.listDealCandidates(1);
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
    }
  }

  /**
   * Run a scan for one specific user. Skips quota-exceeded users and users
   * without a webhook. Records usage_log on success.
   */
  private async scanForUser(user: User, source: ScanRunRecord["source"], searchCache: SearchResultCache): Promise<void> {
    // Quota gate
    const used = await this.dashboardStore.getDailyUsage(user.id);
    if (used >= user.dailyApifyQuota) {
      await this.dashboardStore.log(
        "warn",
        `Quota journalier atteint (${used}/${user.dailyApifyQuota} produits). Scan reporté à demain.`,
        user.id
      );
      return;
    }

    const snapshot = await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches, user.id);

    // Webhook resolution. Seed admin falls back to env's DISCORD_WEBHOOK_URL
    // for legacy compatibility; everyone else must configure via the dashboard.
    let webhookUrl = await this.dashboardStore.getDecryptedWebhook(user.id);
    if (!webhookUrl && user.id === 1) webhookUrl = this.baseConfig.discordWebhookUrl || null;
    if (!webhookUrl && !snapshot.config.dryRun) {
      await this.dashboardStore.log("warn", "Aucun webhook Discord configuré — scan ignoré", user.id);
      return;
    }

    if (snapshot.searches.length === 0) {
      await this.dashboardStore.log("info", "Aucune recherche active — scan ignoré", user.id);
      return;
    }

    // Override the shared snapshot's webhook with this user's
    const userConfig: RuntimeConfig = { ...snapshot.config, discordWebhookUrl: webhookUrl ?? "" };
    const runId = await this.dashboardStore.startScanRun(source, snapshot.searches.length, user.id);
    try {
      const provider = new CachedListingProvider(
        createListingProvider(userConfig),
        searchCache,
        providerCacheNamespace(userConfig)
      );
      const discord = new DiscordWebhook(userConfig);
      const result = await runScan({
        provider,
        store: this.dealStore,
        discord,
        searches: snapshot.searches,
        scoringOptions: snapshot.scoringOptions,
        delivery: snapshot.delivery,
        scanRunId: runId,
        dashboardStore: this.dashboardStore,
        userId: user.id
      });
      await this.dashboardStore.completeScanRun(runId, "success", result, undefined, user.id);
      await this.dashboardStore.recordUsage(user.id, result.listings);

      // Heartbeat — admin only, scheduled scans only, doesn't apply per user
      if (source === "scheduled" && user.plan === "admin") {
        this.scheduledScanCount += 1;
        if (
          userConfig.heartbeatEveryScans > 0 &&
          this.scheduledScanCount % userConfig.heartbeatEveryScans === 0
        ) {
          await discord.sendStatus(
            `Le bot Vinted fonctionne. Dernier scan admin : ${result.listings} annonces, ${result.alertable} alertables, ${result.sent} envoyées. Meilleur candidat : ${result.bestCandidate}.`
          );
        }
      }
    } catch (error) {
      await this.dashboardStore.completeScanRun(
        runId,
        "failed",
        { listings: 0, scored: 0, alertable: 0, sent: 0, bestCandidate: "aucun" },
        messageFromError(error),
        user.id
      );
      throw error;
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
    const globalInterval = fallback ?? (await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches)).config.pollIntervalSeconds;
    const users = await this.dashboardStore.listActiveUsers();
    if (users.length === 0) return globalInterval;

    const intervals = await Promise.all(
      users.map(async (user) => this.effectiveUserIntervalSeconds(user.id, await this.dashboardStore.getUserSettings(user.id), globalInterval))
    );
    return Math.min(globalInterval, ...intervals);
  }

  private effectiveUserIntervalSeconds(userId: number, settings: UserSettings, globalIntervalSeconds: number): number {
    return Math.max(60, userId === 1 ? globalIntervalSeconds : settings.pollIntervalSeconds);
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
