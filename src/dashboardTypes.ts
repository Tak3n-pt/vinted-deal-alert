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
  /** Required price drop to re-alert the same listing. 0.10 = 10% drop. */
  reAlertDropPercent: number;
  /** Cap on Discord alerts per single scan. 0 = unlimited. */
  maxAlertsPerScan: number;
  /** Cap on Discord alerts in any 24h rolling window. 0 = unlimited. */
  maxAlertsPerDay: number;
  /** When true, alerts are still computed but Discord is muted in the window. */
  quietHoursEnabled: boolean;
  /** "HH:MM" 24h, server local time. Inclusive. */
  quietHoursStart: string;
  /** "HH:MM" 24h, server local time. Exclusive. Allowed to wrap past midnight. */
  quietHoursEnd: string;
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
  reAlertDropPercent?: number;
  maxAlertsPerScan?: number;
  maxAlertsPerDay?: number;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
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

/**
 * Alert delivery controls — distinct from scoring options, which decide
 * whether a listing qualifies as a deal at all. These shape *whether and how
 * often* qualifying deals get pushed to Discord.
 */
export interface AlertDeliveryOptions {
  reAlertDropPercent: number;
  maxAlertsPerScan: number;
  maxAlertsPerDay: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface DashboardRuntimeSnapshot {
  config: RuntimeConfig;
  searches: SearchConfig[];
  scoringOptions: ScoringOptions;
  delivery: AlertDeliveryOptions;
}

export interface User {
  id: number;
  discordId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  email: string | null;
  plan: "free" | "pro" | "admin";
  dailyApifyQuota: number;
  betaApproved: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface DiscordProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  email?: string | null;
}

export interface UserSettings {
  userId: number;
  discordWebhookConfigured: boolean;
  dryRun: boolean;
  pollIntervalSeconds: number;
  minDiscountPct: number | null;
  maxProductPrice: number | null;
  updatedAt: string;
}

export type { ModelRule, RiskRules, ScoringOptions };
