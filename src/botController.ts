import { createListingProvider } from "./provider.js";
import { DiscordWebhook } from "./discord.js";
import { runScan } from "./index.js";
import type { DealStore } from "./store.js";
import type { RuntimeConfig, SearchConfig } from "./types.js";
import type { DealCandidateRecord, ScanRunRecord } from "./dashboardTypes.js";
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
    this.scheduleNext(snapshot.config.pollIntervalSeconds);
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
    const snapshot = await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches);
    const runId = await this.dashboardStore.startScanRun(source, snapshot.searches.length);
    try {
      const provider = createListingProvider(snapshot.config);
      const discord = new DiscordWebhook(snapshot.config);
      const result = await runScan({
        provider,
        store: this.dealStore,
        discord,
        searches: snapshot.searches,
        scoringOptions: snapshot.scoringOptions,
        delivery: snapshot.delivery,
        scanRunId: runId,
        dashboardStore: this.dashboardStore
      });
      await this.dashboardStore.completeScanRun(runId, "success", result);

      // Heartbeat counts scheduled scans only — manual / dashboard-triggered
      // scans shouldn't trigger Discord status spam.
      if (source === "scheduled") {
        this.scheduledScanCount += 1;
        if (
          snapshot.config.heartbeatEveryScans > 0 &&
          this.scheduledScanCount % snapshot.config.heartbeatEveryScans === 0
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
        { listings: 0, scored: 0, alertable: 0, sent: 0, bestCandidate: "aucun" },
        messageFromError(error)
      );
      throw error;
    } finally {
      this.scanInFlight = false;
      // Best-effort retention prune after every scan, regardless of outcome.
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
          const snapshot = await this.dashboardStore.runtimeSnapshot(this.baseConfig, this.fallbackSearches);
          this.scheduleNext(snapshot.config.pollIntervalSeconds);
        });
    }, delayMs);
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
