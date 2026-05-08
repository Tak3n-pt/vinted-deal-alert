import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { RuntimeConfig, SearchConfig } from "./types.js";

export const DEFAULT_SEARCHES: SearchConfig[] = [
  { market: "FR", query: "iphone 16 pro max 256go", limit: 10, sort: "newest" },
  { market: "FR", query: "iphone 17 pro 256go", limit: 10, sort: "newest" },
  { market: "FR", query: "iphone 17 pro max 256go", limit: 10, sort: "newest" },
  { market: "FR", query: "samsung s25 ultra 256go", limit: 10, sort: "newest" },
  { market: "FR", query: "samsung s26 ultra 256go", limit: 10, sort: "newest" },
  { market: "FR", query: "samsung galaxy z fold 7 256go", limit: 10, sort: "newest" },
  { market: "FR", query: "samsung galaxy z flip 7 256go", limit: 10, sort: "newest" },
  { market: "FR", query: "google pixel 10 pro 128go", limit: 10, sort: "newest" },
  { market: "FR", query: "google pixel 10 pro xl 256go", limit: 10, sort: "newest" },
  { market: "FR", query: "google pixel 10 pro fold 256go", limit: 10, sort: "newest" }
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
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
    pollIntervalSeconds: intEnv("POLL_INTERVAL_SECONDS", 900),
    providerTimeoutSeconds: intEnv("PROVIDER_TIMEOUT_SECONDS", 20),
    maxProductsPerScan: intEnv("MAX_PRODUCTS_PER_SCAN", 100),
    heartbeatEveryScans: nonNegativeIntEnv("HEARTBEAT_EVERY_SCANS", 4),
    databasePath: process.env.DATABASE_PATH ?? "./data/deals.sqlite",
    runOnStart: boolEnv("RUN_ON_START", true),
    dryRun: boolEnv("DRY_RUN", false)
  };
  if (process.env.APIFY_TOKEN) config.apifyToken = process.env.APIFY_TOKEN;
  return config;
}

export function loadSearches(maxProductsPerScan = intEnv("MAX_PRODUCTS_PER_SCAN", 100)): SearchConfig[] {
  const configPath = process.env.SEARCH_CONFIG_PATH;
  if (!configPath) return enforceSearchBudget(DEFAULT_SEARCHES, maxProductsPerScan);

  const parsed = JSON.parse(readFileSync(resolve(configPath), "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("SEARCH_CONFIG_PATH doit pointer vers un tableau JSON de recherches");
  }

  const searches = parsed.map((item) => {
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
  return enforceSearchBudget(searches, maxProductsPerScan);
}

function enforceSearchBudget(searches: SearchConfig[], maxProductsPerScan: number): SearchConfig[] {
  const requested = searches.reduce((total, search) => total + search.limit, 0);
  if (requested > maxProductsPerScan) {
    throw new Error(
      `La configuration demande ${requested} produits par scan, au-dessus de MAX_PRODUCTS_PER_SCAN=${maxProductsPerScan}. ` +
        "Réduire les recherches ou augmenter MAX_PRODUCTS_PER_SCAN volontairement."
    );
  }
  return searches;
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
