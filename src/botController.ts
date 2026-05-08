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

export class BotController {
  private paused = false;
  private scanInFlight = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextScanAt: Date | undefined;
  private started = false;
  private scanCount = 0;

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
        this.dashboardStore.log("error", `Startup scan failed: ${messageFromError(error)}`).catch((logError) => {
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
    await this.dashboardStore.log("warn", "Bot paused from dashboard");
    return this.status();
  }

  async resume(): Promise<BotStatus> {
    this.paused = false;
    await this.dashboardStore.log("info", "Bot resumed from dashboard");
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
    await new DiscordWebhook(snapshot.config).sendStatus("Test dashboard Vinted Deal Alert.");
    await this.dashboardStore.log("info", "Discord test message sent");
  }

  private async guardedScan(source: ScanRunRecord["source"]): Promise<void> {
    if (this.scanInFlight) {
      await this.dashboardStore.log("warn", "Scan skipped because another scan is already running");
      return;
    }
    if (this.paused && source === "scheduled") {
      await this.dashboardStore.log("warn", "Scheduled scan skipped because bot is paused");
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
        scanRunId: runId,
        dashboardStore: this.dashboardStore
      });
      this.scanCount += 1;
      await this.dashboardStore.completeScanRun(runId, "success", result);

      if (snapshot.config.heartbeatEveryScans > 0 && this.scanCount % snapshot.config.heartbeatEveryScans === 0) {
        await discord.sendStatus(
          `Vinted bot is running. Last scan: ${result.listings} listings, ${result.alertable} alertable, ${result.sent} sent. Best candidate: ${result.bestCandidate}.`
        );
      }
    } catch (error) {
      await this.dashboardStore.completeScanRun(
        runId,
        "failed",
        { listings: 0, scored: 0, alertable: 0, sent: 0, bestCandidate: "none" },
        messageFromError(error)
      );
      throw error;
    } finally {
      this.scanInFlight = false;
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
          this.dashboardStore.log("error", `Scheduled scan failed: ${messageFromError(error)}`).catch((logError) => {
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
