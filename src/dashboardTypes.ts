import type { RuntimeConfig, SearchConfig } from "./types.js";
import type { ModelRule, RiskRules, ScoringOptions } from "./scoring.js";

export interface DashboardSettingsView {
  providerType: RuntimeConfig["providerType"];
  apifyActorId: string;
  authorizedDataApiUrl: string;
  pollIntervalSeconds: number;
  providerTimeoutSeconds: number;
  maxProductsPerScan: number;
  heartbeatEveryScans: number;
  runOnStart: boolean;
  dryRun: boolean;
  minScore: number;
  minDiscount: number;
  minSavings: number;
  discordWebhookConfigured: boolean;
  apifyTokenConfigured: boolean;
  authorizedDataApiKeyConfigured: boolean;
}

export interface DashboardSettingsInput {
  providerType?: RuntimeConfig["providerType"];
  apifyActorId?: string;
  authorizedDataApiUrl?: string;
  authorizedDataApiKey?: string;
  apifyToken?: string;
  discordWebhookUrl?: string;
  pollIntervalSeconds?: number;
  providerTimeoutSeconds?: number;
  maxProductsPerScan?: number;
  heartbeatEveryScans?: number;
  runOnStart?: boolean;
  dryRun?: boolean;
  minScore?: number;
  minDiscount?: number;
  minSavings?: number;
}

export interface DashboardSecrets {
  discordWebhookUrl?: string;
  apifyToken?: string;
  authorizedDataApiKey?: string;
}

export interface DashboardSearch {
  id: number;
  enabled: boolean;
  query: string;
  url?: string;
  market: "FR";
  limit: number;
  sort: "newest";
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSearchInput {
  enabled?: boolean;
  query?: string;
  url?: string;
  market?: "FR";
  limit?: number;
  sort?: "newest";
}

export interface ScanRunRecord {
  id: number;
  source: "scheduled" | "manual" | "startup";
  status: "running" | "success" | "failed" | "skipped";
  startedAt: string;
  finishedAt?: string;
  searchCount: number;
  listings: number;
  scored: number;
  alertable: number;
  sent: number;
  bestCandidate: string;
  error?: string;
}

export interface DealCandidateRecord {
  id: number;
  scanRunId?: number;
  listingId: string;
  title: string;
  model: string;
  storageGb?: number;
  finalPrice: number;
  benchmarkPrice: number;
  discountPercent: number;
  savings: number;
  score: number;
  shouldAlert: boolean;
  sent: boolean;
  url: string;
  imageUrl?: string;
  sellerName?: string;
  riskLevel: string;
  risks: Array<{ code: string; label: string; severity: string }>;
  reasons: string[];
  rejectionReasons: string[];
  createdAt: string;
}

export interface DashboardLogRecord {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
}

export interface DashboardRuntimeSnapshot {
  config: RuntimeConfig;
  searches: SearchConfig[];
  scoringOptions: ScoringOptions;
}

export type { ModelRule, RiskRules, ScoringOptions };
