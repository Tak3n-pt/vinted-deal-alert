import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { RuntimeConfig, SearchConfig } from "./types.js";

// Broad starter pack: one query per phone family. Each returns mixed
// generations (e.g. "iphone pro max" pulls 13/14/15/16/17 Pro Max). The
// scoring brain handles model matching, so a new user gets alerts across
// every premium phone the bot supports without touching the dashboard.
// Users who want narrower coverage can disable these and add their own.
export const DEFAULT_SEARCHES: SearchConfig[] = [
  { market: "FR", query: "iphone pro max", limit: 10, sort: "newest" },
  { market: "FR", query: "iphone pro", limit: 10, sort: "newest" },
  { market: "FR", query: "samsung galaxy ultra", limit: 10, sort: "newest" },
  { market: "FR", query: "samsung galaxy plus", limit: 10, sort: "newest" },
  { market: "FR", query: "samsung galaxy fold", limit: 10, sort: "newest" },
  { market: "FR", query: "samsung galaxy flip", limit: 10, sort: "newest" },
  { market: "FR", query: "google pixel pro", limit: 10, sort: "newest" }
];

export function loadDotEnv(path = ".env"): void {
  const envPath = resolve(path);
  if (!existsSync(envPath)) return;

  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

export function loadConfig(): RuntimeConfig {
  loadDotEnv();

  const config: RuntimeConfig = {
    providerType: providerTypeEnv("PROVIDER_TYPE", process.env.APIFY_TOKEN ? "apify" : "generic"),
    authorizedDataApiUrl: process.env.AUTHORIZED_DATA_API_URL ?? "",
    authorizedDataApiKey: process.env.AUTHORIZED_DATA_API_KEY ?? "",
    apifyActorId: process.env.APIFY_ACTOR_ID ?? "epicscrapers~vinted-search-scraper",
    apifyDetailActorId: process.env.APIFY_DETAIL_ACTOR_ID ?? "anyscrap~vinted-details",
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
    pollIntervalSeconds: intEnv("POLL_INTERVAL_SECONDS", 1800),
    providerTimeoutSeconds: intEnv("PROVIDER_TIMEOUT_SECONDS", 20),
    maxProductsPerScan: intEnv("MAX_PRODUCTS_PER_SCAN", 30),
    heartbeatEveryScans: nonNegativeIntEnv("HEARTBEAT_EVERY_SCANS", 4),
    databasePath: process.env.DATABASE_PATH ?? "./data/deals.sqlite",
    runOnStart: boolEnv("RUN_ON_START", true),
    dryRun: boolEnv("DRY_RUN", false)
  };
  if (process.env.APIFY_TOKEN) config.apifyToken = process.env.APIFY_TOKEN;
  return config;
}

export function loadSearches(_maxProductsPerScan = intEnv("MAX_PRODUCTS_PER_SCAN", 30)): SearchConfig[] {
  const configPath = process.env.SEARCH_CONFIG_PATH;
  if (!configPath) return DEFAULT_SEARCHES;

  const parsed = JSON.parse(readFileSync(resolve(configPath), "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("SEARCH_CONFIG_PATH doit pointer vers un tableau JSON de recherches");
  }

  return parsed.map((item) => {
    const search = item as Partial<SearchConfig>;
    if (!search.query && !search.url) throw new Error("Chaque recherche doit avoir une requête ou une URL");
    const normalized: SearchConfig = {
      market: search.market ?? "FR",
      query: search.query ?? "",
      limit: normalizeLimit(search.limit),
      sort: search.sort ?? "newest"
    };
    if (search.url) normalized.url = search.url;
    return normalized;
  });
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return 10;
  if (!Number.isFinite(value) || value <= 0) throw new Error("La limite de recherche doit être un nombre positif");
  return Math.max(10, Math.floor(value));
}

function providerTypeEnv(key: string, fallback: "generic" | "apify"): "generic" | "apify" {
  const value = process.env[key];
  if (!value) return fallback;
  if (value === "generic" || value === "apify") return value;
  throw new Error(`${key} doit être "generic" ou "apify"`);
}

function intEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} doit être un entier positif`);
  }
  return parsed;
}

function nonNegativeIntEnv(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} doit être un entier positif ou nul`);
  }
  return parsed;
}

function boolEnv(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
