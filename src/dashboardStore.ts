import type { RuntimeConfig, ScoredDeal, SearchConfig } from "./types.js";
import { openSqlDatabase, type SqlDatabase } from "./sqlDatabase.js";
import { buildAnalytics, type AnalyticsSnapshot } from "./analytics.js";
import { DiscordDM } from "./discord.js";
import type {
  DashboardLogRecord,
  DashboardRuntimeSnapshot,
  DashboardSearch,
  DashboardSearchInput,
  DashboardSecrets,
  DashboardSettingsInput,
  DashboardSettingsView,
  DealCandidateRecord,
  DiscordProfile,
  ModelRule,
  RiskRules,
  ScanRunRecord,
  User,
  UserSettings
} from "./dashboardTypes.js";
import { decryptString, encryptString, validateDiscordWebhookUrl } from "./crypto.js";
import { DEFAULT_SEARCHES } from "./config.js";

const DEFAULT_MIN_SCORE = 60;
const DEFAULT_MIN_DISCOUNT = 0.15;
const DEFAULT_MIN_SAVINGS = 60;
const DEFAULT_RE_ALERT_DROP = 0.10;
const DEFAULT_MAX_ALERTS_PER_SCAN = 0;
const DEFAULT_MAX_ALERTS_PER_DAY = 0;
const DEFAULT_QUIET_HOURS_ENABLED = false;
const DEFAULT_QUIET_HOURS_START = "23:00";
const DEFAULT_QUIET_HOURS_END = "08:00";

const DEFAULT_MODEL_RULES: ModelRule[] = [
  { model: "iPhone 13 Pro", enabled: true, storagesGb: [128, 256, 512] },
  { model: "iPhone 13 Pro Max", enabled: true, storagesGb: [128, 256, 512] },
  { model: "iPhone 14 Pro", enabled: true, storagesGb: [128, 256, 512, 1024] },
  { model: "iPhone 14 Pro Max", enabled: true, storagesGb: [128, 256, 512, 1024] },
  { model: "iPhone 15 Pro", enabled: true, storagesGb: [128, 256, 512, 1024] },
  { model: "iPhone 15 Pro Max", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "iPhone 16 Pro", enabled: true, storagesGb: [128, 256, 512, 1024] },
  { model: "iPhone 16 Pro Max", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "iPhone 17 Pro", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "iPhone 17 Pro Max", enabled: true, storagesGb: [256, 512, 1024, 2048] },
  { model: "Samsung Galaxy S22 Plus", enabled: true, storagesGb: [128, 256] },
  { model: "Samsung Galaxy S23 Plus", enabled: true, storagesGb: [256, 512] },
  { model: "Samsung Galaxy S24 Plus", enabled: true, storagesGb: [256, 512] },
  { model: "Samsung Galaxy S25 Plus", enabled: true, storagesGb: [256, 512] },
  { model: "Samsung Galaxy S26 Plus", enabled: true, storagesGb: [256, 512] },
  { model: "Samsung Galaxy S22 Ultra", enabled: true, storagesGb: [128, 256, 512] },
  { model: "Samsung Galaxy S23 Ultra", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "Samsung Galaxy S24 Ultra", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "Samsung Galaxy S25 Ultra", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "Samsung Galaxy S26 Ultra", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "Samsung Galaxy Z Fold 4", enabled: true, storagesGb: [256, 512] },
  { model: "Samsung Galaxy Z Fold 5", enabled: true, storagesGb: [256, 512] },
  { model: "Samsung Galaxy Z Fold 6", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "Samsung Galaxy Z Fold 7", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "Samsung Galaxy Z Flip 4", enabled: true, storagesGb: [128, 256] },
  { model: "Samsung Galaxy Z Flip 5", enabled: true, storagesGb: [256, 512] },
  { model: "Samsung Galaxy Z Flip 6", enabled: true, storagesGb: [256, 512] },
  { model: "Samsung Galaxy Z Flip 7", enabled: true, storagesGb: [256, 512] },
  { model: "Google Pixel 9 Pro", enabled: true, storagesGb: [128, 256, 512, 1024] },
  { model: "Google Pixel 9 Pro XL", enabled: true, storagesGb: [128, 256, 512, 1024] },
  { model: "Google Pixel 9 Pro Fold", enabled: true, storagesGb: [256, 512] },
  { model: "Google Pixel 10 Pro", enabled: true, storagesGb: [128, 256, 512, 1024] },
  { model: "Google Pixel 10 Pro XL", enabled: true, storagesGb: [256, 512, 1024] },
  { model: "Google Pixel 10 Pro Fold", enabled: true, storagesGb: [256, 512, 1024] }
];

const DEFAULT_RISK_RULES: RiskRules = {
  rejectHighRisks: true,
  allowMissingImage: false,
  rejectNonOriginalScreen: true,
  rejectScreenReplaced: false,
  rejectMissingInvoice: false,
  // Keep the default loose enough to catch new-seller bargains. The hard-coded
  // seller risk still blocks very suspicious deep discounts.
  minSellerReviews: 1,
  minSellerRating: 4.2,
  minBatteryHealth: 80,
  allowedCountries: [],
  customExcludeKeywords: [],
  customExcludeSeverity: "reject",
  sellerBlocklist: [],
  sellerAllowlist: [],
  maxFavoriteCount: 0,
  maxListingAgeHours: 0,
  excludeVintedPro: false,
  minSellerItems: 0,
  colorAllowlist: []
};

export class DashboardStore {
  private constructor(private readonly db: SqlDatabase) {}

  static async open(databasePath: string): Promise<DashboardStore> {
    const store = new DashboardStore(await openSqlDatabase(databasePath));
    await store.migrate();
    return store;
  }

  async ensureDefaults(searches: SearchConfig[], userId: number = 1): Promise<void> {
    const searchRow = await this.db.get("select count(*) as count from dashboard_searches where user_id = ?", [userId]);
    if (Number(searchRow?.count ?? 0) === 0) {
      for (const search of searches) await this.createSearch(search, undefined, userId);
    }

    const modelRow = await this.db.get("select count(*) as count from dashboard_model_rules where user_id = ?", [userId]);
    if (Number(modelRow?.count ?? 0) === 0) {
      await this.replaceModelRules(DEFAULT_MODEL_RULES, userId);
    } else {
      await this.ensureMissingModelRules(userId);
    }

    const riskRow = await this.db.get("select count(*) as count from user_risk_rules where user_id = ?", [userId]);
    if (Number(riskRow?.count ?? 0) === 0) {
      await this.updateRiskRules(DEFAULT_RISK_RULES, userId);
    }
  }

  async restoreDefaults(searches: SearchConfig[], userId: number = 1): Promise<void> {
    await this.db.run("delete from dashboard_searches where user_id = ?", [userId]);
    await this.db.run("delete from dashboard_model_rules where user_id = ?", [userId]);
    await this.db.run("delete from user_risk_rules where user_id = ?", [userId]);
    await this.ensureDefaults(searches, userId);
    await this.log("info", "Règles restaurées par défaut", userId);
  }

  /**
   * Seed model rules, risk rules, and the broad starter-pack searches for a
   * freshly-onboarded user. Idempotent — only inserts when each table is
   * empty for this user. Default searches are flagged so the UI can offer a
   * "switch to manual" prompt later when the user adds custom searches.
   */
  async seedNewUserDefaults(userId: number, defaultSearches: SearchConfig[] = []): Promise<void> {
    const modelRow = await this.db.get("select count(*) as count from dashboard_model_rules where user_id = ?", [userId]);
    if (Number(modelRow?.count ?? 0) === 0) {
      await this.replaceModelRules(DEFAULT_MODEL_RULES, userId);
    }
    const riskRow = await this.db.get("select count(*) as count from user_risk_rules where user_id = ?", [userId]);
    if (Number(riskRow?.count ?? 0) === 0) {
      await this.updateRiskRules(DEFAULT_RISK_RULES, userId);
    }
    if (defaultSearches.length > 0) {
      await this.seedDefaultSearches(defaultSearches, userId);
    }
  }

  async settingsView(baseConfig: RuntimeConfig): Promise<DashboardSettingsView> {
    const providerType = await this.setting("providerType", baseConfig.providerType);
    const normalizedProvider = providerType === "apify" || providerType === "generic" ? providerType : baseConfig.providerType;
    return {
      providerType: normalizedProvider,
      apifyActorId: await this.setting("apifyActorId", baseConfig.apifyActorId),
      authorizedDataApiUrl: await this.setting("authorizedDataApiUrl", baseConfig.authorizedDataApiUrl),
      pollIntervalSeconds: await this.intSetting("pollIntervalSeconds", baseConfig.pollIntervalSeconds),
      providerTimeoutSeconds: await this.intSetting("providerTimeoutSeconds", baseConfig.providerTimeoutSeconds),
      maxProductsPerScan: await this.intSetting("maxProductsPerScan", baseConfig.maxProductsPerScan),
      heartbeatEveryScans: await this.nonNegativeIntSetting("heartbeatEveryScans", baseConfig.heartbeatEveryScans),
      runOnStart: await this.boolSetting("runOnStart", baseConfig.runOnStart),
      dryRun: await this.boolSetting("dryRun", baseConfig.dryRun),
      minScore: await this.percentIntSetting("minScore", DEFAULT_MIN_SCORE),
      minDiscount: await this.numberSetting("minDiscount", DEFAULT_MIN_DISCOUNT),
      minSavings: await this.numberSetting("minSavings", DEFAULT_MIN_SAVINGS),
      reAlertDropPercent: await this.fractionSetting("reAlertDropPercent", DEFAULT_RE_ALERT_DROP),
      maxAlertsPerScan: await this.nonNegativeIntSetting("maxAlertsPerScan", DEFAULT_MAX_ALERTS_PER_SCAN),
      maxAlertsPerDay: await this.nonNegativeIntSetting("maxAlertsPerDay", DEFAULT_MAX_ALERTS_PER_DAY),
      quietHoursEnabled: await this.boolSetting("quietHoursEnabled", DEFAULT_QUIET_HOURS_ENABLED),
      quietHoursStart: validHHMMor(await this.setting("quietHoursStart", DEFAULT_QUIET_HOURS_START), DEFAULT_QUIET_HOURS_START),
      quietHoursEnd: validHHMMor(await this.setting("quietHoursEnd", DEFAULT_QUIET_HOURS_END), DEFAULT_QUIET_HOURS_END),
      discordWebhookConfigured: (await this.hasSecret("discordWebhookUrl")) || Boolean(baseConfig.discordWebhookUrl),
      apifyTokenConfigured: (await this.hasSecret("apifyToken")) || Boolean(baseConfig.apifyToken),
      authorizedDataApiKeyConfigured: (await this.hasSecret("authorizedDataApiKey")) || Boolean(baseConfig.authorizedDataApiKey)
    };
  }

  async updateSettings(input: DashboardSettingsInput): Promise<void> {
    if (input.providerType !== undefined) {
      if (input.providerType !== "apify" && input.providerType !== "generic") throw new Error("providerType must be apify or generic");
      await this.upsertSetting("providerType", input.providerType, false);
    }
    if (input.apifyActorId !== undefined) await this.upsertSetting("apifyActorId", input.apifyActorId.trim(), false);
    if (input.authorizedDataApiUrl !== undefined) await this.upsertSetting("authorizedDataApiUrl", input.authorizedDataApiUrl.trim(), false);
    if (input.pollIntervalSeconds !== undefined) await this.upsertSetting("pollIntervalSeconds", String(positiveInt(input.pollIntervalSeconds, "pollIntervalSeconds")), false);
    if (input.providerTimeoutSeconds !== undefined) await this.upsertSetting("providerTimeoutSeconds", String(positiveInt(input.providerTimeoutSeconds, "providerTimeoutSeconds")), false);
    if (input.maxProductsPerScan !== undefined) await this.upsertSetting("maxProductsPerScan", String(positiveInt(input.maxProductsPerScan, "maxProductsPerScan")), false);
    if (input.heartbeatEveryScans !== undefined) await this.upsertSetting("heartbeatEveryScans", String(nonNegativeInt(input.heartbeatEveryScans, "heartbeatEveryScans")), false);
    if (input.runOnStart !== undefined) await this.upsertSetting("runOnStart", String(input.runOnStart), false);
    if (input.dryRun !== undefined) await this.upsertSetting("dryRun", String(input.dryRun), false);
    if (input.minScore !== undefined) await this.upsertSetting("minScore", String(clampInt(input.minScore, 0, 100, "minScore")), false);
    if (input.minDiscount !== undefined) await this.upsertSetting("minDiscount", String(fraction(input.minDiscount, "minDiscount")), false);
    if (input.minSavings !== undefined) await this.upsertSetting("minSavings", String(nonNegativeNumber(input.minSavings, "minSavings")), false);
    if (input.reAlertDropPercent !== undefined) await this.upsertSetting("reAlertDropPercent", String(fraction(input.reAlertDropPercent, "reAlertDropPercent")), false);
    if (input.maxAlertsPerScan !== undefined) await this.upsertSetting("maxAlertsPerScan", String(nonNegativeInt(input.maxAlertsPerScan, "maxAlertsPerScan")), false);
    if (input.maxAlertsPerDay !== undefined) await this.upsertSetting("maxAlertsPerDay", String(nonNegativeInt(input.maxAlertsPerDay, "maxAlertsPerDay")), false);
    if (input.quietHoursEnabled !== undefined) await this.upsertSetting("quietHoursEnabled", String(input.quietHoursEnabled), false);
    if (input.quietHoursStart !== undefined) await this.upsertSetting("quietHoursStart", requireHHMM(input.quietHoursStart, "quietHoursStart"), false);
    if (input.quietHoursEnd !== undefined) await this.upsertSetting("quietHoursEnd", requireHHMM(input.quietHoursEnd, "quietHoursEnd"), false);

    if (input.discordWebhookUrl !== undefined && input.discordWebhookUrl.trim()) {
      await this.upsertSetting("discordWebhookUrl", input.discordWebhookUrl.trim(), true);
    }
    if (input.apifyToken !== undefined && input.apifyToken.trim()) {
      await this.upsertSetting("apifyToken", input.apifyToken.trim(), true);
    }
    if (input.authorizedDataApiKey !== undefined && input.authorizedDataApiKey.trim()) {
      await this.upsertSetting("authorizedDataApiKey", input.authorizedDataApiKey.trim(), true);
    }

    await this.log("info", "Paramètres du dashboard mis à jour");
  }

  async secrets(): Promise<DashboardSecrets> {
    const secrets: DashboardSecrets = {};
    const discordWebhookUrl = await this.secret("discordWebhookUrl");
    if (discordWebhookUrl) secrets.discordWebhookUrl = discordWebhookUrl;
    const apifyToken = await this.secret("apifyToken");
    if (apifyToken) secrets.apifyToken = apifyToken;
    const authorizedDataApiKey = await this.secret("authorizedDataApiKey");
    if (authorizedDataApiKey) secrets.authorizedDataApiKey = authorizedDataApiKey;
    return secrets;
  }

  async runtimeSnapshot(
    baseConfig: RuntimeConfig,
    fallbackSearches: SearchConfig[],
    userId: number = 1
  ): Promise<DashboardRuntimeSnapshot> {
    const view = await this.settingsView(baseConfig);
    const secrets = await this.secrets();
    const userSettings = await this.getUserSettings(userId);
    const effectivePollInterval = userId === 1 ? view.pollIntervalSeconds : userSettings.pollIntervalSeconds;
    const effectiveDryRun = userId === 1 ? view.dryRun : view.dryRun || userSettings.dryRun;
    const config: RuntimeConfig = {
      providerType: view.providerType,
      authorizedDataApiUrl: view.authorizedDataApiUrl,
      authorizedDataApiKey: secrets.authorizedDataApiKey ?? baseConfig.authorizedDataApiKey,
      apifyActorId: view.apifyActorId,
      apifyDetailActorId: baseConfig.apifyDetailActorId,
      discordWebhookUrl: secrets.discordWebhookUrl ?? baseConfig.discordWebhookUrl,
      pollIntervalSeconds: effectivePollInterval,
      providerTimeoutSeconds: view.providerTimeoutSeconds,
      maxProductsPerScan: view.maxProductsPerScan,
      heartbeatEveryScans: view.heartbeatEveryScans,
      databasePath: baseConfig.databasePath,
      runOnStart: view.runOnStart,
      dryRun: effectiveDryRun
    };
    const apifyToken = secrets.apifyToken ?? baseConfig.apifyToken;
    if (apifyToken) config.apifyToken = apifyToken;

    const configuredSearches = await this.activeSearches(userId);
    // Fallback searches only kick in for the seed admin (user_id=1). New users
    // start with an empty list and must add their own — fallback would be
    // confusing.
    const searches = configuredSearches.length > 0
      ? configuredSearches
      : (userId === 1 ? fallbackSearches : []);
    // Per-user overrides on top of admin's global thresholds. Stored in
    // user_settings as percent (0..100); scoring expects a 0..1 fraction.
    // If null, falls back to the global value — admins can set a baseline
    // and users opt into stricter thresholds.
    const effectiveMinDiscount = userSettings.minDiscountPct != null
      ? userSettings.minDiscountPct / 100
      : view.minDiscount;
    const modelRulesForUser = await this.listModelRules(userId);
    // Per-user max_product_price acts as a hard ceiling. Apply it on top of
    // each model's existing maxFinalPrice — take the more restrictive of the
    // two so a user's cap can only tighten, never relax, a model rule.
    const userMax = userSettings.maxProductPrice;
    const modelRulesScoped = userMax != null
      ? modelRulesForUser.map((rule) => ({
          ...rule,
          maxFinalPrice: rule.maxFinalPrice != null ? Math.min(rule.maxFinalPrice, userMax) : userMax
        }))
      : modelRulesForUser;
    return {
      config,
      searches,
      scoringOptions: {
        minScore: view.minScore,
        minDiscount: effectiveMinDiscount,
        minSavings: view.minSavings,
        modelRules: modelRulesScoped,
        riskRules: await this.getRiskRules(userId)
      },
      delivery: {
        reAlertDropPercent: view.reAlertDropPercent,
        maxAlertsPerScan: view.maxAlertsPerScan,
        maxAlertsPerDay: view.maxAlertsPerDay,
        quietHoursEnabled: view.quietHoursEnabled,
        quietHoursStart: view.quietHoursStart,
        quietHoursEnd: view.quietHoursEnd
      }
    };
  }

  /**
   * Active users for the bot loop. Includes:
   * - admin-plan users (always active)
   * - beta_approved users with a configured webhook
   *
   * Filters out users who never completed OAuth (`last_login_at IS NULL`)
   * except the seed admin (id=1) which is bootstrapped without OAuth. This
   * prevents half-onboarded rows (created by a Stripe webhook arriving
   * before the user finishes Discord OAuth) from triggering useless scans.
   */
  async listActiveUsers(): Promise<User[]> {
    // Eligibility: paying/admin user with a delivery channel. After the DM-first
    // migration, every OAuth-logged-in user has u.discord_id set, so DM is the
    // default channel. Webhook is retained as legacy fallback. Admin (id=1)
    // always passes for the dev-loop case where the env webhook is the only
    // channel set up.
    const rows = await this.db.all(`
      select u.* from users u
      inner join user_settings s on s.user_id = u.id
      where (u.plan = 'admin' or u.beta_approved = 1)
        and (u.discord_id is not null or s.discord_webhook_configured = 1 or s.dry_run = 1 or u.id = 1)
        and (u.id = 1 or u.last_login_at is not null)
      order by u.id asc
    `);
    return rows.map(userFromRow);
  }

  /**
   * Increment today's usage counter for a user. Upserts a row keyed on
   * (user_id, day) so the first call of the day inserts and subsequent calls
   * add to the running total. "Today" is anchored to Europe/Paris (the user
   * base's local day), not server UTC.
   */
  async recordUsage(userId: number, productsFetched: number, scansRun: number = 1): Promise<void> {
    const day = parisDateISO();
    await this.db.run(
      this.db.dialect === "postgres"
        ? `insert into usage_log (user_id, day, products_fetched, scans_run)
           values (?, ?, ?, ?)
           on conflict (user_id, day) do update set
             products_fetched = usage_log.products_fetched + excluded.products_fetched,
             scans_run = usage_log.scans_run + excluded.scans_run`
        : `insert into usage_log (user_id, day, products_fetched, scans_run)
           values (?, ?, ?, ?)
           on conflict(user_id, day) do update set
             products_fetched = usage_log.products_fetched + excluded.products_fetched,
             scans_run = usage_log.scans_run + excluded.scans_run`,
      [userId, day, productsFetched, scansRun]
    );
  }

  /** Products fetched today (Europe/Paris) for a user. 0 if no row yet. */
  async getDailyUsage(userId: number): Promise<number> {
    const row = await this.db.get(
      "select products_fetched from usage_log where user_id = ? and day = ?",
      [userId, parisDateISO()]
    );
    return row ? Number(row.products_fetched ?? 0) : 0;
  }

  async listSearches(userId: number = 1): Promise<DashboardSearch[]> {
    return (await this.db.all(
      "select * from dashboard_searches where user_id = ? order by id asc",
      [userId]
    )).map(searchFromRow);
  }

  /**
   * Rotation-aware scan picker. Returns up to `maxListings/10` enabled searches
   * sorted by `last_polled_at` ASC (oldest first, nulls first). Does NOT mark
   * them as polled — the caller must call `markSearchesPolled(ids)` after the
   * scan succeeds. This way a failed scan doesn't burn the rotation slot.
   */
  async getSearchesForScan(
    userId: number,
    maxListings: number
  ): Promise<{ searches: SearchConfig[]; ids: number[] }> {
    const slots = Math.max(1, Math.floor(maxListings / 10));
    const rows = await this.db.all(
      `select * from dashboard_searches
       where user_id = ? and enabled = 1
       order by case when last_polled_at is null then 0 else 1 end, last_polled_at asc, id asc
       limit ?`,
      [userId, slots]
    );
    if (rows.length === 0) return { searches: [], ids: [] };
    const ids = rows.map((r) => Number(r.id));
    const perSearchLimit = Math.ceil(maxListings / slots);
    const searches = rows.map((row) => {
      const search = searchFromRow(row);
      return {
        market: search.market,
        query: search.query,
        limit: Math.min(search.limit, perSearchLimit),
        sort: search.sort,
        ...(search.url ? { url: search.url } : {})
      };
    });
    return { searches, ids };
  }

  /**
   * Mark searches as freshly polled. Called by the bot loop AFTER the scan
   * completes successfully so that a failed scan retries the same slice.
   */
  async markSearchesPolled(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    await this.db.run(
      `update dashboard_searches set last_polled_at = CURRENT_TIMESTAMP where id in (${placeholders})`,
      ids
    );
  }

  async countEnabledSearches(userId: number = 1): Promise<number> {
    const row = await this.db.get(
      "select count(*) as count from dashboard_searches where user_id = ? and enabled = 1",
      [userId]
    );
    return Number(row?.count ?? 0);
  }

  async activeSearches(userId: number = 1): Promise<SearchConfig[]> {
    return (await this.listSearches(userId))
      .filter((search) => search.enabled)
      .map((search) => ({
        market: search.market,
        query: search.query,
        limit: search.limit,
        sort: search.sort,
        ...(search.url ? { url: search.url } : {})
      }));
  }

  async createSearch(
    input: DashboardSearchInput,
    _fallbackCap?: number,
    userId: number = 1,
    options: { isDefault?: boolean } = {}
  ): Promise<DashboardSearch> {
    const normalized = normalizeSearch(input);
    await this.assertSearchBudget(undefined, normalized, userId);
    const id = await this.db.insert(
      `insert into dashboard_searches
        (enabled, query, url, market, search_limit, sort, created_at, updated_at, user_id, is_default)
       values (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)`,
      [normalized.enabled ? 1 : 0, normalized.query, normalized.url ?? null, normalized.market, normalized.limit, normalized.sort, userId, options.isDefault ? 1 : 0]
    );
    await this.log("info", `Recherche créée : ${normalized.query || normalized.url || "url"}`, userId);
    return this.getSearch(id, userId);
  }

  /**
   * Seed the broad starter pack for a freshly-onboarded user. Each search is
   * flagged is_default=1 so the UI can offer a "switch to manual" option
   * when the user later adds their own narrow searches. Idempotent — bails
   * out if any search already exists for the user.
   */
  async seedDefaultSearches(searches: SearchConfig[], userId: number): Promise<void> {
    const row = await this.db.get(
      "select count(*) as count from dashboard_searches where user_id = ?",
      [userId]
    );
    if (Number(row?.count ?? 0) > 0) return;
    for (const search of searches) {
      await this.createSearch(search, undefined, userId, { isDefault: true });
    }
  }

  /**
   * Disable all default searches for a user. Used when the user opts out of
   * "automatic" mode by adding their own narrow searches and confirming the
   * "turn off automatic watching" prompt. Doesn't delete the rows so the
   * user can re-enable them later via the dashboard.
   */
  async disableDefaultSearches(userId: number): Promise<number> {
    const result = await this.db.run(
      "update dashboard_searches set enabled = 0, updated_at = CURRENT_TIMESTAMP where user_id = ? and is_default = 1 and enabled = 1",
      [userId]
    );
    if (result.changes > 0) {
      await this.log("info", `Recherches automatiques désactivées (${result.changes})`, userId);
    }
    return result.changes;
  }

  async updateSearch(id: number, input: DashboardSearchInput, _fallbackCap?: number, userId: number = 1): Promise<DashboardSearch> {
    const existing = await this.getSearch(id, userId);
    const normalized = normalizeSearch({ ...existing, ...input });
    await this.assertSearchBudget(id, normalized, userId);
    await this.db.run(
      `update dashboard_searches
       set enabled = ?, query = ?, url = ?, market = ?, search_limit = ?, sort = ?, updated_at = CURRENT_TIMESTAMP
       where id = ? and user_id = ?`,
      [normalized.enabled ? 1 : 0, normalized.query, normalized.url ?? null, normalized.market, normalized.limit, normalized.sort, id, userId]
    );
    await this.log("info", `Recherche mise à jour : ${normalized.query || normalized.url || "url"}`, userId);
    return this.getSearch(id, userId);
  }

  /**
   * Reject saves that would push the number of *enabled* searches above
   * `MAX_USER_SEARCHES` (default 20). With rotation in place, the per-scan
   * cost is bounded by `maxProductsPerScan`; this cap is just a sanity guard
   * against runaway configurations.
   */
  private async assertSearchBudget(
    updatingId: number | undefined,
    candidate: Required<DashboardSearchInput>,
    userId: number = 1
  ): Promise<void> {
    if (!candidate.enabled) return;
    // With rotation, the cap protects against runaway counts, not per-scan cost.
    // Allow up to MAX_USER_SEARCHES enabled (default 20 — sanity, not budget).
    // Guard against a malformed env value (`Number("abc") === NaN`) which would
    // otherwise let `enabledCount > NaN` evaluate false and bypass the cap.
    const parsedCap = Number(process.env.MAX_USER_SEARCHES);
    const maxSearches = Number.isFinite(parsedCap) && parsedCap > 0 ? Math.floor(parsedCap) : 20;
    const countRow = await this.db.get(
      updatingId === undefined
        ? "select count(*) as c from dashboard_searches where enabled = 1 and user_id = ?"
        : "select count(*) as c from dashboard_searches where enabled = 1 and user_id = ? and id <> ?",
      updatingId === undefined ? [userId] : [userId, updatingId]
    );
    const enabledCount = Number(countRow?.c ?? 0) + 1;
    if (enabledCount > maxSearches) {
      throw new Error(
        `Trop de recherches actives : ${enabledCount}. Maximum autorisé : ${maxSearches}.`
      );
    }
  }

  async deleteSearch(id: number, userId: number = 1): Promise<void> {
    const result = await this.db.run("delete from dashboard_searches where id = ? and user_id = ?", [id, userId]);
    if (result.changes === 0) throw new Error("Search not found");
    await this.log("warn", `Recherche supprimée : ${id}`, userId);
  }

  async listModelRules(userId: number = 1): Promise<ModelRule[]> {
    return (await this.db.all(
      "select * from dashboard_model_rules where user_id = ? order by model asc",
      [userId]
    )).map(modelRuleFromRow);
  }

  async replaceModelRules(rules: ModelRule[], userId: number = 1): Promise<ModelRule[]> {
    await this.db.transaction(async () => {
      await this.db.run("delete from dashboard_model_rules where user_id = ?", [userId]);
      for (const rule of rules) {
        await this.insertModelRule(normalizeModelRule(rule), userId);
      }
    });
    await this.log("info", "Règles des modèles mises à jour", userId);
    return this.listModelRules(userId);
  }

  async getRiskRules(userId: number = 1): Promise<RiskRules> {
    const row = await this.db.get("select * from user_risk_rules where user_id = ?", [userId]);
    return row ? riskRulesFromRow(row) : { ...DEFAULT_RISK_RULES };
  }

  async updateRiskRules(input: Partial<RiskRules>, userId: number = 1): Promise<RiskRules> {
    const current = await this.getRiskRules(userId);
    const normalized = normalizeRiskRules({ ...current, ...input });
    await this.db.run(
      `insert into user_risk_rules
        (user_id, reject_high_risks, allow_missing_image, reject_non_original_screen, reject_screen_replaced,
         reject_missing_invoice, min_seller_reviews, min_seller_rating, min_battery_health,
         allowed_countries_json, custom_exclude_keywords_json, custom_exclude_severity,
         seller_blocklist_json, seller_allowlist_json, max_favorite_count, max_listing_age_hours,
         exclude_vinted_pro, min_seller_items, max_battery_health, color_allowlist_json, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       on conflict(user_id) do update set
         reject_high_risks = excluded.reject_high_risks,
         allow_missing_image = excluded.allow_missing_image,
         reject_non_original_screen = excluded.reject_non_original_screen,
         reject_screen_replaced = excluded.reject_screen_replaced,
         reject_missing_invoice = excluded.reject_missing_invoice,
         min_seller_reviews = excluded.min_seller_reviews,
         min_seller_rating = excluded.min_seller_rating,
         min_battery_health = excluded.min_battery_health,
         allowed_countries_json = excluded.allowed_countries_json,
         custom_exclude_keywords_json = excluded.custom_exclude_keywords_json,
         custom_exclude_severity = excluded.custom_exclude_severity,
         seller_blocklist_json = excluded.seller_blocklist_json,
         seller_allowlist_json = excluded.seller_allowlist_json,
         max_favorite_count = excluded.max_favorite_count,
         max_listing_age_hours = excluded.max_listing_age_hours,
         exclude_vinted_pro = excluded.exclude_vinted_pro,
         min_seller_items = excluded.min_seller_items,
         max_battery_health = excluded.max_battery_health,
         color_allowlist_json = excluded.color_allowlist_json,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        normalized.rejectHighRisks ? 1 : 0,
        normalized.allowMissingImage ? 1 : 0,
        normalized.rejectNonOriginalScreen ? 1 : 0,
        normalized.rejectScreenReplaced ? 1 : 0,
        normalized.rejectMissingInvoice ? 1 : 0,
        normalized.minSellerReviews,
        normalized.minSellerRating,
        normalized.minBatteryHealth,
        JSON.stringify(normalized.allowedCountries),
        JSON.stringify(normalized.customExcludeKeywords),
        normalized.customExcludeSeverity,
        JSON.stringify(normalized.sellerBlocklist),
        JSON.stringify(normalized.sellerAllowlist),
        normalized.maxFavoriteCount,
        normalized.maxListingAgeHours,
        normalized.excludeVintedPro ? 1 : 0,
        normalized.minSellerItems,
        normalized.maxBatteryHealth ?? null,
        JSON.stringify(normalized.colorAllowlist)
      ]
    );
    await this.log("info", "Règles de risque mises à jour", userId);
    return this.getRiskRules(userId);
  }

  async startScanRun(source: ScanRunRecord["source"], searchCount: number, userId: number = 1): Promise<number> {
    return this.db.insert(
      `insert into scan_runs
        (source, status, started_at, search_count, listings, scored, alertable, sent, best_candidate, user_id)
       values (?, 'running', CURRENT_TIMESTAMP, ?, 0, 0, 0, 0, '', ?)`,
      [source, searchCount, userId]
    );
  }

  async completeScanRun(
    id: number,
    status: ScanRunRecord["status"],
    result: { listings: number; scored: number; alertable: number; sent: number; bestCandidate: string },
    error?: string,
    userId: number = 1
  ): Promise<void> {
    await this.db.run(
      `update scan_runs
       set status = ?, finished_at = CURRENT_TIMESTAMP, listings = ?, scored = ?, alertable = ?,
           sent = ?, best_candidate = ?, error = ?
       where id = ? and user_id = ?`,
      [status, result.listings, result.scored, result.alertable, result.sent, result.bestCandidate, error ?? null, id, userId]
    );
    await this.log(
      status === "failed" ? "error" : "info",
      `Scan ${status === "failed" ? "échoué" : "réussi"} : ${result.listings} annonces, ${result.sent} alertes envoyées`,
      userId
    );
  }

  async recordDealCandidates(scanRunId: number | undefined, deals: ScoredDeal[], sentIds: Set<string>, userId: number = 1): Promise<void> {
    if (deals.length === 0) return;
    await this.db.transaction(async () => {
      for (const deal of deals) {
        const hoursSinceListed = computeHoursSinceListed(deal.listing.listedAt);
        await this.db.run(
          `insert into deal_candidates
            (scan_run_id, listing_id, title, model, storage_gb, final_price, benchmark_price,
             discount_percent, savings, score, should_alert, sent, url, image_url, seller_name,
             risk_level, risks_json, reasons_json, rejection_reasons_json, seller_country,
             item_location, hours_since_listed, match_confidence, family, generation, tier,
             favorite_count, created_at, user_id)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
          [
            scanRunId ?? null,
            deal.listing.id,
            deal.listing.title,
            deal.match.model,
            deal.match.storageGb ?? null,
            deal.finalPrice,
            deal.benchmarkPrice,
            deal.discountPercent,
            deal.savings,
            deal.score,
            deal.shouldAlert ? 1 : 0,
            sentIds.has(deal.listing.id) ? 1 : 0,
            deal.listing.url,
            deal.listing.imageUrl ?? null,
            deal.listing.sellerName ?? null,
            riskLevel(deal),
            JSON.stringify(deal.risks),
            JSON.stringify(deal.reasons),
            JSON.stringify(deal.rejectionReasons),
            deal.listing.sellerCountry ?? deal.listing.itemCountry ?? null,
            deal.listing.itemLocation ?? deal.listing.sellerLocation ?? null,
            hoursSinceListed,
            deal.match.confidence ?? null,
            deal.match.family ?? null,
            deal.match.generation ?? null,
            deal.match.tier ?? null,
            deal.listing.favoriteCount ?? null,
            userId
          ]
        );
      }
    });
  }

  async pruneRetention(options: { dealCandidatesKeep: number; logsKeep: number; scanRunsKeep: number }): Promise<void> {
    // Per-user retention. The previous global cap let a noisy user evict a
    // quiet user's history once both shared the same table. We now run the
    // cap separately per user_id so each customer keeps their full window.
    const userRows = await this.db.all("select id from users");
    const userIds = userRows.map((row) => Number(row.id));
    for (const userId of userIds) {
      await this.deleteExceedingForUser("deal_candidates", options.dealCandidatesKeep, userId);
      await this.deleteExceedingForUser("dashboard_logs", options.logsKeep, userId);
      await this.deleteExceedingForUser("scan_runs", options.scanRunsKeep, userId);
    }
    // Sessions: drop anything past expiry. Cheap, idempotent, prevents the
    // admin_sessions table from accumulating dead rows over months.
    await this.db.run(
      this.db.dialect === "postgres"
        ? "delete from admin_sessions where expires_at <= CURRENT_TIMESTAMP"
        : "delete from admin_sessions where expires_at <= datetime('now')"
    );
    // Stripe event dedup: keep 30 days of history. Stripe retries within
    // hours, so a month-long window is well past any realistic replay.
    await this.db.run(
      this.db.dialect === "postgres"
        ? "delete from processed_stripe_events where processed_at < CURRENT_TIMESTAMP - interval '30 days'"
        : "delete from processed_stripe_events where processed_at < datetime('now', '-30 days')"
    );
  }

  private async deleteExceedingForUser(table: string, keep: number, userId: number): Promise<void> {
    const safeKeep = Math.max(100, Math.floor(keep));
    if (this.db.dialect === "postgres") {
      await this.db.run(
        `delete from ${table}
         where user_id = ? and id <= (
           select id from ${table} where user_id = ? order by id desc offset ? limit 1
         )`,
        [userId, userId, safeKeep]
      );
    } else {
      await this.db.run(
        `delete from ${table}
         where user_id = ? and id <= (
           select id from ${table} where user_id = ? order by id desc limit 1 offset ?
         )`,
        [userId, userId, safeKeep]
      );
    }
  }

  private async deleteExceeding(table: string, keep: number): Promise<void> {
    const safeKeep = Math.max(100, Math.floor(keep));
    // Look up the id at position `safeKeep` (0-indexed) when ordered newest
    // first — that's the first row to drop. Delete everything with id ≤ that.
    // When fewer rows exist, the subquery is empty and nothing is deleted.
    if (this.db.dialect === "postgres") {
      await this.db.run(
        `delete from ${table}
         where id <= (select id from ${table} order by id desc offset ? limit 1)`,
        [safeKeep]
      );
      return;
    }
    await this.db.run(
      `delete from ${table}
       where id <= (select id from ${table} order by id desc limit 1 offset ?)`,
      [safeKeep]
    );
  }

  async listScanRuns(limit = 50, userId: number = 1): Promise<ScanRunRecord[]> {
    return (await this.db.all(
      "select * from scan_runs where user_id = ? order by id desc limit ?",
      [userId, clampInt(limit, 1, 200, "limit")]
    )).map(scanRunFromRow);
  }

  async listDealCandidates(limit = 100, userId: number = 1): Promise<DealCandidateRecord[]> {
    return (await this.db.all(
      "select * from deal_candidates where user_id = ? order by id desc limit ?",
      [userId, clampInt(limit, 1, 300, "limit")]
    )).map(dealCandidateFromRow);
  }

  /**
   * Aggregated analytics for the Statistiques view. Pure read — works against
   * existing deal_candidates / scan_runs / dashboard_logs rows. Range is the
   * lookback window in days (default 30).
   *
   * Heavy aggregation is done in JS rather than SQL to keep the queries
   * dialect-agnostic. Volume should stay manageable: dealCandidatesKeep caps
   * the table at ~10k rows per user.
   */
  async getAnalytics(userId: number = 1, rangeDays: number = 30): Promise<AnalyticsSnapshot> {
    const clampedDays = clampInt(rangeDays, 1, 365, "rangeDays");
    const cutoffSql =
      this.db.dialect === "postgres"
        ? `CURRENT_TIMESTAMP - (?::int * interval '1 day')`
        : `datetime('now', ?)`;
    const cutoffArg = this.db.dialect === "postgres" ? clampedDays : `-${clampedDays} days`;

    const deals = await this.db.all(
      `select * from deal_candidates where user_id = ? and created_at >= ${cutoffSql} order by id desc`,
      [userId, cutoffArg]
    );
    const scans = await this.db.all(
      `select * from scan_runs where user_id = ? and started_at >= ${cutoffSql} order by id desc`,
      [userId, cutoffArg]
    );

    return buildAnalytics(deals, scans, clampedDays);
  }

  async listLogs(limit = 100, userId: number = 1): Promise<DashboardLogRecord[]> {
    return (await this.db.all(
      "select * from dashboard_logs where user_id = ? order by id desc limit ?",
      [userId, clampInt(limit, 1, 300, "limit")]
    )).map(logFromRow);
  }

  async log(level: DashboardLogRecord["level"], message: string, userId: number = 1): Promise<void> {
    await this.db.run(
      "insert into dashboard_logs (level, message, created_at, user_id) values (?, ?, CURRENT_TIMESTAMP, ?)",
      [level, message, userId]
    );
  }

  async createSession(tokenHash: string, expiresAt: string, userId: number = 1): Promise<void> {
    await this.db.run(
      "insert into admin_sessions (token_hash, expires_at, created_at, user_id) values (?, ?, CURRENT_TIMESTAMP, ?)",
      [tokenHash, expiresAt, userId]
    );
  }

  async validateSession(tokenHash: string): Promise<boolean> {
    const expirationSql = this.db.dialect === "postgres" ? "expires_at <= CURRENT_TIMESTAMP" : "expires_at <= datetime('now')";
    await this.db.run(`delete from admin_sessions where ${expirationSql}`);
    const row = await this.db.get("select token_hash from admin_sessions where token_hash = ?", [tokenHash]);
    return Boolean(row);
  }

  /**
   * Return the user_id bound to a session token (after cleaning expired
   * sessions). Returns null if no valid session.
   */
  async getSessionUser(tokenHash: string): Promise<number | null> {
    const expirationSql = this.db.dialect === "postgres" ? "expires_at <= CURRENT_TIMESTAMP" : "expires_at <= datetime('now')";
    await this.db.run(`delete from admin_sessions where ${expirationSql}`);
    const row = await this.db.get("select user_id from admin_sessions where token_hash = ?", [tokenHash]);
    if (!row) return null;
    const value = Number(row.user_id);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.run("delete from admin_sessions where token_hash = ?", [tokenHash]);
  }

  /**
   * Insert or update a user from a fresh Discord profile. Returns the row.
   * The unique key is `discord_id` (Discord snowflake). On update, refreshes
   * username, avatar, email, and last_login_at.
   */
  async upsertUserFromDiscord(profile: DiscordProfile): Promise<User> {
    const username = profile.global_name?.trim() || profile.username || null;
    const avatar = profile.avatar ?? null;
    const email = profile.email ?? null;
    if (this.db.dialect === "postgres") {
      await this.db.run(
        `insert into users (discord_id, discord_username, discord_avatar, email, last_login_at)
         values (?, ?, ?, ?, now())
         on conflict (discord_id) do update set
           discord_username = excluded.discord_username,
           discord_avatar = excluded.discord_avatar,
           email = excluded.email,
           last_login_at = now()`,
        [profile.id, username, avatar, email]
      );
    } else {
      await this.db.run(
        `insert into users (discord_id, discord_username, discord_avatar, email, last_login_at)
         values (?, ?, ?, ?, CURRENT_TIMESTAMP)
         on conflict (discord_id) do update set
           discord_username = excluded.discord_username,
           discord_avatar = excluded.discord_avatar,
           email = excluded.email,
           last_login_at = CURRENT_TIMESTAMP`,
        [profile.id, username, avatar, email]
      );
    }
    const row = await this.db.get("select * from users where discord_id = ?", [profile.id]);
    if (!row) throw new Error("upsertUserFromDiscord: user row missing after upsert");
    const userId = Number(row.id);
    // Ensure user_settings row exists for this user
    await this.db.run(
      this.db.dialect === "postgres"
        ? "insert into user_settings (user_id) values (?) on conflict (user_id) do nothing"
        : "insert or ignore into user_settings (user_id) values (?)",
      [userId]
    );
    // Seed model rules + risk rules for first-time OAuth users (idempotent).
    // Skip for the seed admin (id=1) which is bootstrapped via ensureDefaults.
    if (userId !== 1) await this.seedNewUserDefaults(userId, DEFAULT_SEARCHES);
    return userFromRow(row);
  }

  async getUserById(id: number): Promise<User | null> {
    const row = await this.db.get("select * from users where id = ?", [id]);
    return row ? userFromRow(row) : null;
  }

  async getUserByDiscordId(discordId: string): Promise<User | null> {
    const row = await this.db.get("select * from users where discord_id = ?", [discordId]);
    return row ? userFromRow(row) : null;
  }

  async setUserBetaApproved(id: number, approved: boolean): Promise<void> {
    await this.db.run("update users set beta_approved = ? where id = ?", [approved ? 1 : 0, id]);
    await this.log("info", approved ? "Accès beta accordé" : "Accès beta retiré", id);
  }

  async syncSubscriptionAccess(input: {
    discordId: string;
    active: boolean;
    paidQuota: number;
    freeQuota: number;
    source?: string;
    /** Stripe event.id for idempotency. When set and already processed, returns the current row unchanged. */
    eventId?: string | null;
    /** True when this sync is a dunning notice (Stripe is still retrying). Keeps access on but logs a warning. */
    paymentFailed?: boolean;
    /** Stripe customer id captured from session/subscription. Persisted to users.stripe_customer_id. */
    stripeCustomerId?: string | null;
    /** Subscription period end as a UTC ISO string. Persisted to users.current_period_end. */
    currentPeriodEnd?: string | null;
  }): Promise<User> {
    const discordId = input.discordId.trim();
    if (!/^\d{17,19}$/.test(discordId)) throw new Error("discordId invalide");

    // Idempotency: if Stripe replays an event we've already handled, return
    // the existing user without re-running side-effects. The row is logged
    // here so concurrent retries from a single event collapse to one upsert.
    if (input.eventId) {
      const existing = await this.db.get(
        "select event_id from processed_stripe_events where event_id = ?",
        [input.eventId]
      );
      if (existing) {
        const row = await this.db.get("select * from users where discord_id = ?", [discordId]);
        if (row) return userFromRow(row);
      }
    }

    const paidQuota = nonNegativeInt(input.paidQuota, "paidQuota");
    const freeQuota = nonNegativeInt(input.freeQuota, "freeQuota");
    const quota = input.active ? paidQuota : freeQuota;
    const betaApproved = input.active ? 1 : 0;
    const plan: User["plan"] = input.active ? "pro" : "free";
    const stripeCustomerId = input.stripeCustomerId?.trim() || null;
    const currentPeriodEnd = input.currentPeriodEnd?.trim() || null;

    let row = await this.db.get("select * from users where discord_id = ?", [discordId]);
    const wasNew = !row;
    if (!row) {
      await this.db.run(
        `insert into users (discord_id, discord_username, plan, daily_apify_quota, beta_approved, stripe_customer_id, current_period_end)
         values (?, ?, ?, ?, ?, ?, ?)`,
        [discordId, null, plan, quota, betaApproved, stripeCustomerId, currentPeriodEnd]
      );
      row = await this.db.get("select * from users where discord_id = ?", [discordId]);
    } else {
      // No special-case for admin: the owner is now a regular paying user.
      // Lifetime Stripe coupon keeps their subscription active so no surprise
      // downgrades from cancel webhooks. Stripe customer id and period_end
      // use COALESCE so we don't blank them on a sync that omits them.
      await this.db.run(
        `update users set
           plan = ?,
           daily_apify_quota = ?,
           beta_approved = ?,
           stripe_customer_id = coalesce(?, stripe_customer_id),
           current_period_end = coalesce(?, current_period_end)
         where discord_id = ?`,
        [plan, quota, betaApproved, stripeCustomerId, currentPeriodEnd, discordId]
      );
      row = await this.db.get("select * from users where discord_id = ?", [discordId]);
    }

    if (!row) throw new Error("syncSubscriptionAccess: user row missing after sync");
    const user = userFromRow(row);
    await this.db.run(
      this.db.dialect === "postgres"
        ? "insert into user_settings (user_id) values (?) on conflict (user_id) do nothing"
        : "insert or ignore into user_settings (user_id) values (?)",
      [user.id]
    );
    if (user.id !== 1) await this.seedNewUserDefaults(user.id, DEFAULT_SEARCHES);

    const source = input.source ? ` (${input.source.slice(0, 80)})` : "";
    if (input.paymentFailed) {
      await this.log(
        "warn",
        `Échec de paiement Stripe — Stripe relance, accès conservé${source}`,
        user.id
      );
    } else {
      await this.log(
        "info",
        input.active
          ? `Abonnement synchronisé : accès pro activé${source}`
          : `Abonnement synchronisé : accès retiré${source}`,
        user.id
      );
    }

    if (input.eventId) {
      // Record the event AFTER the upsert so a crash before the SQL above
      // leaves the event re-processable on retry. Idempotent INSERT.
      await this.db.run(
        this.db.dialect === "postgres"
          ? "insert into processed_stripe_events (event_id) values (?) on conflict (event_id) do nothing"
          : "insert or ignore into processed_stripe_events (event_id) values (?)",
        [input.eventId]
      );
    }

    // First-time activation: send a welcome DM so the user knows the bot is
    // alive. Best-effort — failure (DMs disabled, no shared guild yet) is
    // logged but doesn't block the sync.
    if (wasNew && input.active) {
      this.sendWelcomeDM(discordId, user.id).catch(() => undefined);
    }

    return user;
  }

  private async sendWelcomeDM(discordId: string, userId: number): Promise<void> {
    const botToken = (process.env.DISCORD_BOT_TOKEN ?? "").trim();
    if (!botToken) return;
    const message =
      "Bienvenue chez Bonoitec Flash !\n\n" +
      "Tu viens d'activer le bot. À partir de maintenant je surveille Vinted en continu et je te DM ici dès qu'une affaire intéressante apparaît.\n\n" +
      "Configure tes recherches, modèles et filtres sur le dashboard : https://bonoitec-home.vercel.app/dashboard\n\n" +
      "Premier scan dans quelques minutes — à très vite.";
    try {
      const dm = new DiscordDM(botToken);
      await dm.sendStatus(discordId, message);
      await this.log("info", "DM de bienvenue envoyé", userId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.log("warn", `DM de bienvenue échoué : ${detail}`, userId).catch(() => undefined);
    }
  }

  /**
   * Per-user settings (webhook, dry_run, custom thresholds). Returns
   * `discordWebhookConfigured` as a boolean — the actual URL is never sent to
   * the client. To use the webhook from the bot loop, call `getDecryptedWebhook`.
   */
  async getUserSettings(userId: number): Promise<UserSettings> {
    const row = await this.db.get("select * from user_settings where user_id = ?", [userId]);
    if (!row) {
      // Defensive: ensure a row exists (upsertUserFromDiscord creates one,
      // but the seed admin path doesn't always go through that).
      await this.db.run(
        this.db.dialect === "postgres"
          ? "insert into user_settings (user_id) values (?) on conflict (user_id) do nothing"
          : "insert or ignore into user_settings (user_id) values (?)",
        [userId]
      );
      return this.getUserSettings(userId);
    }
    const base = userSettingsFromRow(row);
    // Probe decryption: a stored webhook that no longer decrypts (most
    // commonly after DASHBOARD_ENCRYPTION_KEY rotation) is reported to the
    // dashboard so the user sees a banner instead of silently missing alerts.
    let decryptError = false;
    if (base.discordWebhookConfigured && typeof row.discord_webhook_enc === "string" && row.discord_webhook_enc) {
      try {
        decryptString(String(row.discord_webhook_enc));
      } catch {
        decryptError = true;
      }
    }
    return { ...base, discordWebhookDecryptError: decryptError };
  }

  /**
   * Internal use only — for the bot loop and the webhook-test route. Returns
   * the plaintext webhook URL, or null if the user hasn't configured one.
   */
  async getDecryptedWebhook(userId: number): Promise<string | null> {
    const row = await this.db.get(
      "select discord_webhook_enc from user_settings where user_id = ?",
      [userId]
    );
    if (!row || !row.discord_webhook_enc) return null;
    try {
      return decryptString(String(row.discord_webhook_enc));
    } catch (error) {
      await this.log("error", `Webhook déchiffrement échoué : ${messageFromError(error)}`, userId);
      return null;
    }
  }

  async setUserDiscordWebhook(userId: number, url: string | null): Promise<void> {
    if (url === null || url === "") {
      await this.db.run(
        "update user_settings set discord_webhook_enc = null, discord_webhook_configured = 0, updated_at = CURRENT_TIMESTAMP where user_id = ?",
        [userId]
      );
      await this.log("info", "Webhook Discord retiré", userId);
      return;
    }
    const validated = validateDiscordWebhookUrl(url);
    const enc = encryptString(validated);
    await this.db.run(
      "update user_settings set discord_webhook_enc = ?, discord_webhook_configured = 1, updated_at = CURRENT_TIMESTAMP where user_id = ?",
      [enc, userId]
    );
    await this.log("info", "Webhook Discord configuré", userId);
  }

  async updateUserSettings(
    userId: number,
    input: { dryRun?: boolean; pollIntervalSeconds?: number; minDiscountPct?: number | null; maxProductPrice?: number | null }
  ): Promise<UserSettings> {
    await this.getUserSettings(userId); // ensure row exists
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.dryRun !== undefined) {
      updates.push("dry_run = ?");
      params.push(input.dryRun ? 1 : 0);
    }
    if (input.pollIntervalSeconds !== undefined) {
      updates.push("poll_interval_seconds = ?");
      params.push(clampInt(input.pollIntervalSeconds, 60, 86400, "pollIntervalSeconds"));
    }
    if (input.minDiscountPct !== undefined) {
      updates.push("min_discount_pct = ?");
      params.push(input.minDiscountPct === null ? null : clampNumber(input.minDiscountPct, 0, 100, "minDiscountPct"));
    }
    if (input.maxProductPrice !== undefined) {
      updates.push("max_product_price = ?");
      params.push(input.maxProductPrice === null ? null : nonNegativeNumber(input.maxProductPrice, "maxProductPrice"));
    }
    if (updates.length) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(userId);
      await this.db.run(`update user_settings set ${updates.join(", ")} where user_id = ?`, params);
    }
    return this.getUserSettings(userId);
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  private async getSearch(id: number, userId: number = 1): Promise<DashboardSearch> {
    const row = await this.db.get("select * from dashboard_searches where id = ? and user_id = ?", [id, userId]);
    if (!row) throw new Error("Search not found");
    return searchFromRow(row);
  }

  private async ensureMissingModelRules(userId: number = 1): Promise<void> {
    const rows = await this.db.all("select model from dashboard_model_rules where user_id = ?", [userId]);
    const existing = new Set(rows.map((row) => String(row.model)));
    let inserted = 0;
    for (const rule of DEFAULT_MODEL_RULES) {
      if (existing.has(rule.model)) continue;
      await this.insertModelRule(normalizeModelRule(rule), userId);
      inserted += 1;
    }
    if (inserted > 0) await this.log("info", `${inserted} nouveaux modèles ajoutés aux règles`, userId);
  }

  private async insertModelRule(normalized: ModelRule, userId: number = 1): Promise<void> {
    await this.db.run(
      `insert into dashboard_model_rules
        (user_id, model, enabled, storages_json, max_final_price, min_score, min_discount, min_savings, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        userId,
        normalized.model,
        normalized.enabled ? 1 : 0,
        JSON.stringify(normalized.storagesGb),
        normalized.maxFinalPrice ?? null,
        normalized.minScore ?? null,
        normalized.minDiscount ?? null,
        normalized.minSavings ?? null
      ]
    );
  }

  private async setting(key: string, fallback: string): Promise<string> {
    const row = await this.db.get("select value from dashboard_settings where key = ? and secret = 0", [key]);
    return typeof row?.value === "string" ? row.value : fallback;
  }

  private async secret(key: string): Promise<string | undefined> {
    const row = await this.db.get("select value from dashboard_settings where key = ? and secret = 1", [key]);
    return typeof row?.value === "string" && row.value ? row.value : undefined;
  }

  private async hasSecret(key: string): Promise<boolean> {
    return (await this.secret(key)) !== undefined;
  }

  private async intSetting(key: string, fallback: number): Promise<number> {
    return positiveInt(Number(await this.setting(key, String(fallback))), key);
  }

  private async nonNegativeIntSetting(key: string, fallback: number): Promise<number> {
    return nonNegativeInt(Number(await this.setting(key, String(fallback))), key);
  }

  private async percentIntSetting(key: string, fallback: number): Promise<number> {
    return clampInt(Number(await this.setting(key, String(fallback))), 0, 100, key);
  }

  private async numberSetting(key: string, fallback: number): Promise<number> {
    const value = Number(await this.setting(key, String(fallback)));
    if (!Number.isFinite(value) || value < 0) return fallback;
    return value;
  }

  private async fractionSetting(key: string, fallback: number): Promise<number> {
    const value = Number(await this.setting(key, String(fallback)));
    if (!Number.isFinite(value)) return fallback;
    return Math.min(1, Math.max(0, value));
  }

  private async boolSetting(key: string, fallback: boolean): Promise<boolean> {
    const value = (await this.setting(key, String(fallback))).toLowerCase();
    if (["true", "1", "yes", "on"].includes(value)) return true;
    if (["false", "0", "no", "off"].includes(value)) return false;
    return fallback;
  }

  private async upsertSetting(key: string, value: string, secret: boolean): Promise<void> {
    await this.db.run(
      `insert into dashboard_settings (key, value, secret, updated_at)
       values (?, ?, ?, CURRENT_TIMESTAMP)
       on conflict(key) do update set value = excluded.value, secret = excluded.secret, updated_at = CURRENT_TIMESTAMP`,
      [key, value, secret ? 1 : 0]
    );
  }

  private async migrate(): Promise<void> {
    if (this.db.dialect === "postgres") {
      await this.db.exec(`
        create table if not exists dashboard_settings (
          key text primary key,
          value text not null,
          secret integer not null default 0,
          updated_at timestamptz not null
        );

        create table if not exists dashboard_searches (
          id integer generated by default as identity primary key,
          enabled integer not null default 1,
          query text not null,
          url text,
          market text not null default 'FR',
          search_limit integer not null default 10,
          sort text not null default 'newest',
          created_at timestamptz not null,
          updated_at timestamptz not null
        );

        create table if not exists dashboard_model_rules (
          model text primary key,
          enabled integer not null default 1,
          storages_json text not null,
          max_final_price real,
          min_score integer,
          min_discount real,
          min_savings real,
          updated_at timestamptz not null
        );

        create table if not exists dashboard_risk_rules (
          id integer primary key check (id = 1),
          reject_high_risks integer not null default 1,
          allow_missing_image integer not null default 0,
          reject_non_original_screen integer not null default 1,
          reject_screen_replaced integer not null default 0,
          reject_missing_invoice integer not null default 0,
          min_seller_reviews integer not null default 0,
          min_seller_rating real not null default 0,
          min_battery_health integer not null default 80,
          allowed_countries_json text not null default '[]',
          custom_exclude_keywords_json text not null default '[]',
          custom_exclude_severity text not null default 'reject',
          updated_at timestamptz not null
        );

        create table if not exists scan_runs (
          id integer generated by default as identity primary key,
          source text not null,
          status text not null,
          started_at timestamptz not null,
          finished_at timestamptz,
          search_count integer not null,
          listings integer not null default 0,
          scored integer not null default 0,
          alertable integer not null default 0,
          sent integer not null default 0,
          best_candidate text not null default '',
          error text
        );

        create table if not exists deal_candidates (
          id integer generated by default as identity primary key,
          scan_run_id integer,
          listing_id text not null,
          title text not null,
          model text not null,
          storage_gb integer,
          final_price real not null,
          benchmark_price real not null,
          discount_percent real not null,
          savings real not null,
          score integer not null,
          should_alert integer not null,
          sent integer not null,
          url text not null,
          image_url text,
          seller_name text,
          risk_level text not null,
          risks_json text not null,
          reasons_json text not null,
          rejection_reasons_json text not null,
          created_at timestamptz not null
        );

        create index if not exists idx_deal_candidates_created
          on deal_candidates (created_at);

        create table if not exists admin_sessions (
          token_hash text primary key,
          expires_at timestamptz not null,
          created_at timestamptz not null
        );

        create table if not exists dashboard_logs (
          id integer generated by default as identity primary key,
          level text not null,
          message text not null,
          created_at timestamptz not null
        );
      `);
      // Backfill columns for existing postgres installs that pre-date the
      // custom-keyword exclude feature.
      await this.addColumnIfMissing("dashboard_risk_rules", "custom_exclude_keywords_json", "text not null default '[]'");
      await this.addColumnIfMissing("dashboard_risk_rules", "custom_exclude_severity", "text not null default 'reject'");
      await this.applyMultiTenantSchema();
      return;
    }

    await this.db.exec(`
      create table if not exists dashboard_settings (
        key text primary key,
        value text not null,
        secret integer not null default 0,
        updated_at text not null
      );

      create table if not exists dashboard_searches (
        id integer primary key autoincrement,
        enabled integer not null default 1,
        query text not null,
        url text,
        market text not null default 'FR',
        search_limit integer not null default 10,
        sort text not null default 'newest',
        created_at text not null,
        updated_at text not null
      );

      create table if not exists dashboard_model_rules (
        model text primary key,
        enabled integer not null default 1,
        storages_json text not null,
        max_final_price real,
        min_score integer,
        min_discount real,
        min_savings real,
        updated_at text not null
      );

      create table if not exists dashboard_risk_rules (
        id integer primary key check (id = 1),
        reject_high_risks integer not null default 1,
        allow_missing_image integer not null default 0,
        reject_non_original_screen integer not null default 1,
        reject_screen_replaced integer not null default 0,
        reject_missing_invoice integer not null default 0,
        min_seller_reviews integer not null default 0,
        min_seller_rating real not null default 0,
        min_battery_health integer not null default 80,
        allowed_countries_json text not null default '[]',
        custom_exclude_keywords_json text not null default '[]',
        custom_exclude_severity text not null default 'reject',
        updated_at text not null
      );

      create table if not exists scan_runs (
        id integer primary key autoincrement,
        source text not null,
        status text not null,
        started_at text not null,
        finished_at text,
        search_count integer not null,
        listings integer not null default 0,
        scored integer not null default 0,
        alertable integer not null default 0,
        sent integer not null default 0,
        best_candidate text not null default '',
        error text
      );

      create table if not exists deal_candidates (
        id integer primary key autoincrement,
        scan_run_id integer,
        listing_id text not null,
        title text not null,
        model text not null,
        storage_gb integer,
        final_price real not null,
        benchmark_price real not null,
        discount_percent real not null,
        savings real not null,
        score integer not null,
        should_alert integer not null,
        sent integer not null,
        url text not null,
        image_url text,
        seller_name text,
        risk_level text not null,
        risks_json text not null,
        reasons_json text not null,
        rejection_reasons_json text not null,
        created_at text not null
      );

      create index if not exists idx_deal_candidates_created
        on deal_candidates (created_at);

      create table if not exists admin_sessions (
        token_hash text primary key,
        expires_at text not null,
        created_at text not null
      );

      create table if not exists dashboard_logs (
        id integer primary key autoincrement,
        level text not null,
        message text not null,
        created_at text not null
      );
    `);
    // Backfill columns for existing sqlite installs that pre-date the
    // custom-keyword exclude feature.
    await this.addColumnIfMissing("dashboard_risk_rules", "custom_exclude_keywords_json", "text not null default '[]'");
    await this.addColumnIfMissing("dashboard_risk_rules", "custom_exclude_severity", "text not null default 'reject'");
    await this.applyMultiTenantSchema();
  }

  /**
   * Multi-tenant schema layer. Adds per-user tables (users, user_settings,
   * user_risk_rules, usage_log) and a `user_id` column on every existing data
   * table. Every existing row backfills to the seed admin (user_id = 1) so the
   * single-tenant dashboard keeps working through the new code path.
   *
   * The dashboard_model_rules primary key changes from `(model)` to
   * `(user_id, model)` so two users can pick the same model. That step is
   * guarded by a one-shot flag in dashboard_settings since dropping a PK is
   * destructive.
   *
   * All other operations are idempotent (`create table if not exists`,
   * `addColumnIfMissing`, `insert ... on conflict do nothing`).
   */
  private async applyMultiTenantSchema(): Promise<void> {
    if (this.db.dialect === "postgres") {
      await this.db.exec(`
        create table if not exists users (
          id bigint generated by default as identity primary key,
          discord_id text not null unique,
          discord_username text,
          discord_avatar text,
          email text,
          plan text not null default 'free' check (plan in ('free','pro','admin')),
          daily_apify_quota integer not null default 30,
          beta_approved integer not null default 0,
          created_at timestamptz not null default now(),
          last_login_at timestamptz
        );

        insert into users (id, discord_id, discord_username, plan, daily_apify_quota, beta_approved)
        values (1, 'system', 'system-admin', 'admin', 99999, 1)
        on conflict do nothing;

        -- Advance the identity sequence past the seeded id=1. Without this, the
        -- next OAuth signup would request nextval=1 and hit a PK collision —
        -- 'generated by default as identity' does NOT auto-advance when you
        -- insert an explicit value. Idempotent: always sets to max(id) or 1.
        select setval(pg_get_serial_sequence('users', 'id'), greatest(1, (select max(id) from users)));

        create table if not exists user_settings (
          user_id bigint primary key references users(id) on delete cascade,
          discord_webhook_enc text,
          discord_webhook_configured integer not null default 0,
          dry_run integer not null default 0,
          poll_interval_seconds integer not null default 1800,
          min_discount_pct real,
          max_product_price real,
          updated_at timestamptz not null default now()
        );

        insert into user_settings (user_id) values (1)
        on conflict (user_id) do nothing;

        create table if not exists user_risk_rules (
          user_id bigint primary key references users(id) on delete cascade,
          reject_high_risks integer not null default 1,
          allow_missing_image integer not null default 0,
          reject_non_original_screen integer not null default 1,
          reject_screen_replaced integer not null default 0,
          reject_missing_invoice integer not null default 0,
          min_seller_reviews integer not null default 0,
          min_seller_rating real not null default 0,
          min_battery_health integer not null default 80,
          allowed_countries_json text not null default '[]',
          custom_exclude_keywords_json text not null default '[]',
          custom_exclude_severity text not null default 'reject',
          updated_at timestamptz not null default now()
        );

        insert into user_risk_rules (user_id, reject_high_risks, allow_missing_image,
          reject_non_original_screen, reject_screen_replaced, reject_missing_invoice,
          min_seller_reviews, min_seller_rating, min_battery_health,
          allowed_countries_json, custom_exclude_keywords_json, custom_exclude_severity, updated_at)
        select 1, reject_high_risks, allow_missing_image, reject_non_original_screen,
          reject_screen_replaced, reject_missing_invoice, min_seller_reviews, min_seller_rating,
          min_battery_health, allowed_countries_json, custom_exclude_keywords_json,
          custom_exclude_severity, updated_at
        from dashboard_risk_rules where id = 1
        on conflict (user_id) do nothing;

        create table if not exists usage_log (
          user_id bigint not null references users(id) on delete cascade,
          day date not null,
          products_fetched integer not null default 0,
          scans_run integer not null default 0,
          primary key (user_id, day)
        );

        create index if not exists idx_usage_log_day on usage_log (day);
      `);
    } else {
      await this.db.exec(`
        create table if not exists users (
          id integer primary key autoincrement,
          discord_id text not null unique,
          discord_username text,
          discord_avatar text,
          email text,
          plan text not null default 'free' check (plan in ('free','pro','admin')),
          daily_apify_quota integer not null default 30,
          beta_approved integer not null default 0,
          created_at text not null default CURRENT_TIMESTAMP,
          last_login_at text
        );

        insert or ignore into users (id, discord_id, discord_username, plan, daily_apify_quota, beta_approved, created_at)
        values (1, 'system', 'system-admin', 'admin', 99999, 1, CURRENT_TIMESTAMP);

        create table if not exists user_settings (
          user_id integer primary key references users(id) on delete cascade,
          discord_webhook_enc text,
          discord_webhook_configured integer not null default 0,
          dry_run integer not null default 0,
          poll_interval_seconds integer not null default 1800,
          min_discount_pct real,
          max_product_price real,
          updated_at text not null default CURRENT_TIMESTAMP
        );

        insert or ignore into user_settings (user_id) values (1);

        create table if not exists user_risk_rules (
          user_id integer primary key references users(id) on delete cascade,
          reject_high_risks integer not null default 1,
          allow_missing_image integer not null default 0,
          reject_non_original_screen integer not null default 1,
          reject_screen_replaced integer not null default 0,
          reject_missing_invoice integer not null default 0,
          min_seller_reviews integer not null default 0,
          min_seller_rating real not null default 0,
          min_battery_health integer not null default 80,
          allowed_countries_json text not null default '[]',
          custom_exclude_keywords_json text not null default '[]',
          custom_exclude_severity text not null default 'reject',
          updated_at text not null default CURRENT_TIMESTAMP
        );

        insert or ignore into user_risk_rules (user_id, reject_high_risks, allow_missing_image,
          reject_non_original_screen, reject_screen_replaced, reject_missing_invoice,
          min_seller_reviews, min_seller_rating, min_battery_health,
          allowed_countries_json, custom_exclude_keywords_json, custom_exclude_severity, updated_at)
        select 1, reject_high_risks, allow_missing_image, reject_non_original_screen,
          reject_screen_replaced, reject_missing_invoice, min_seller_reviews, min_seller_rating,
          min_battery_health, allowed_countries_json, custom_exclude_keywords_json,
          custom_exclude_severity, updated_at
        from dashboard_risk_rules where id = 1;

        create table if not exists usage_log (
          user_id integer not null references users(id) on delete cascade,
          day text not null,
          products_fetched integer not null default 0,
          scans_run integer not null default 0,
          primary key (user_id, day)
        );

        create index if not exists idx_usage_log_day on usage_log (day);
      `);
    }

    // Add nullable user_id column with default 1 (the seed admin) to every
    // existing data table. Nullable + default lets existing rows backfill in
    // place; new rows must pass an explicit user_id from the application.
    const userIdColumn = "integer not null default 1 references users(id)";
    await this.addColumnIfMissing("dashboard_searches", "user_id", userIdColumn);
    await this.addColumnIfMissing("dashboard_searches", "last_polled_at", this.db.dialect === "postgres" ? "timestamptz" : "text");
    await this.addColumnIfMissing("dashboard_searches", "is_default", "integer not null default 0");
    await this.addColumnIfMissing("dashboard_model_rules", "user_id", userIdColumn);
    await this.addColumnIfMissing("scan_runs", "user_id", userIdColumn);
    await this.addColumnIfMissing("deal_candidates", "user_id", userIdColumn);
    await this.addColumnIfMissing("admin_sessions", "user_id", userIdColumn);
    await this.addColumnIfMissing("dashboard_logs", "user_id", userIdColumn);

    // Stripe-flow columns. `stripe_customer_id` lets the Vercel side mint
    // Customer Portal sessions without re-querying Stripe by metadata.
    // `current_period_end` is surfaced through /api/internal/access-check so
    // the dashboard can render an "expires in N days" banner.
    await this.addColumnIfMissing("users", "stripe_customer_id", "text");
    await this.addColumnIfMissing("users", "current_period_end", this.db.dialect === "postgres" ? "timestamptz" : "text");

    // Stripe webhook idempotency. Each `event.id` is logged on first processing
    // so a replay during a Stripe outage doesn't re-run the upsert / dunning
    // log entries. Retention prunes rows older than 30 days (see pruneRetention).
    if (this.db.dialect === "postgres") {
      await this.db.exec(`
        create table if not exists processed_stripe_events (
          event_id text primary key,
          processed_at timestamptz not null default now()
        );
        create index if not exists idx_stripe_events_processed_at on processed_stripe_events (processed_at);
      `);
    } else {
      await this.db.exec(`
        create table if not exists processed_stripe_events (
          event_id text primary key,
          processed_at text not null default CURRENT_TIMESTAMP
        );
        create index if not exists idx_stripe_events_processed_at on processed_stripe_events (processed_at);
      `);
    }

    // Composite PK on dashboard_model_rules — guarded by a one-shot flag in
    // dashboard_settings because dropping a primary key is destructive.
    const flag = await this.db.get("select value from dashboard_settings where key = 'multi_tenant_model_rules_pk'");
    if (!flag) {
      if (this.db.dialect === "postgres") {
        await this.db.exec(`
          alter table dashboard_model_rules drop constraint if exists dashboard_model_rules_pkey;
          alter table dashboard_model_rules add constraint dashboard_model_rules_pkey primary key (user_id, model);
        `);
      } else {
        // SQLite doesn't support `alter table drop constraint`. Rebuild the
        // table preserving all rows and the new composite PK.
        await this.db.exec(`
          create table dashboard_model_rules_new (
            user_id integer not null default 1 references users(id),
            model text not null,
            enabled integer not null default 1,
            storages_json text not null,
            max_final_price real,
            min_score integer,
            min_discount real,
            min_savings real,
            updated_at text not null,
            primary key (user_id, model)
          );
          insert into dashboard_model_rules_new (user_id, model, enabled, storages_json,
            max_final_price, min_score, min_discount, min_savings, updated_at)
          select coalesce(user_id, 1), model, enabled, storages_json,
            max_final_price, min_score, min_discount, min_savings, updated_at
          from dashboard_model_rules;
          drop table dashboard_model_rules;
          alter table dashboard_model_rules_new rename to dashboard_model_rules;
        `);
      }
      await this.db.run(
        this.db.dialect === "postgres"
          ? "insert into dashboard_settings (key, value, secret, updated_at) values ('multi_tenant_model_rules_pk', '1', 0, now())"
          : "insert into dashboard_settings (key, value, secret, updated_at) values ('multi_tenant_model_rules_pk', '1', 0, CURRENT_TIMESTAMP)"
      );
    }

    // Analytics-enabling columns on deal_candidates. All nullable, additive —
    // older rows keep their null values and stats queries coalesce gracefully.
    await this.addColumnIfMissing("deal_candidates", "seller_country", "text");
    await this.addColumnIfMissing("deal_candidates", "item_location", "text");
    await this.addColumnIfMissing("deal_candidates", "hours_since_listed", "real");
    await this.addColumnIfMissing("deal_candidates", "match_confidence", "real");
    await this.addColumnIfMissing("deal_candidates", "family", "text");
    await this.addColumnIfMissing("deal_candidates", "generation", "integer");
    await this.addColumnIfMissing("deal_candidates", "tier", "text");
    await this.addColumnIfMissing("deal_candidates", "favorite_count", "integer");

    // Extended seller/listing filters on user_risk_rules. JSON columns for
    // arrays keep the schema flat. Same defaults on the legacy single-tenant
    // dashboard_risk_rules table so both code paths stay in sync.
    for (const table of ["user_risk_rules", "dashboard_risk_rules"]) {
      await this.addColumnIfMissing(table, "seller_blocklist_json", "text not null default '[]'");
      await this.addColumnIfMissing(table, "seller_allowlist_json", "text not null default '[]'");
      await this.addColumnIfMissing(table, "max_favorite_count", "integer");
      await this.addColumnIfMissing(table, "max_listing_age_hours", "integer");
      await this.addColumnIfMissing(table, "exclude_vinted_pro", "integer not null default 0");
      await this.addColumnIfMissing(table, "min_seller_items", "integer not null default 0");
      await this.addColumnIfMissing(table, "max_battery_health", "integer");
      await this.addColumnIfMissing(table, "color_allowlist_json", "text not null default '[]'");
    }

    // One-shot scrub of the old scoring defaults. Earlier versions stored
    // 82 / 0.22 / 80 in dashboard_settings on first start; the rebalance to
    // 60 / 0.15 / 60 only takes effect if those legacy rows are absent (the
    // settings reader falls back to the new DEFAULT_MIN_* constants when no
    // row exists). Only deletes rows that still hold the exact legacy values
    // so an operator's own override is never overwritten.
    const scrubFlag = await this.db.get(
      "select value from dashboard_settings where key = 'scoring_defaults_rebalance_2026_05'"
    );
    if (!scrubFlag) {
      await this.db.run(
        "delete from dashboard_settings where key = 'minScore' and value = '82'"
      );
      await this.db.run(
        "delete from dashboard_settings where key = 'minDiscount' and value = '0.22'"
      );
      await this.db.run(
        "delete from dashboard_settings where key = 'minSavings' and value = '80'"
      );
      await this.db.run(
        this.db.dialect === "postgres"
          ? "insert into dashboard_settings (key, value, secret, updated_at) values ('scoring_defaults_rebalance_2026_05', '1', 0, now())"
          : "insert into dashboard_settings (key, value, secret, updated_at) values ('scoring_defaults_rebalance_2026_05', '1', 0, CURRENT_TIMESTAMP)"
      );
    }

    // One-shot swap of the admin's legacy narrow starter pack to the new
    // broad auto-mode searches. Only fires if the admin row (user_id=1) has
    // exactly the three pre-rebalance default queries AND no auto-mode
    // searches yet. Anyone who has added their own searches is left alone.
    const autoSwapFlag = await this.db.get(
      "select value from dashboard_settings where key = 'admin_autosearch_swap_2026_05'"
    );
    if (!autoSwapFlag) {
      const adminRows = await this.db.all(
        "select query, is_default from dashboard_searches where user_id = 1"
      );
      const hasAuto = adminRows.some((row) => Number(row.is_default ?? 0) === 1);
      const queries = adminRows.map((row) => String(row.query ?? ""));
      const legacyDefaults = new Set([
        "iphone 16 pro max 256go",
        "samsung galaxy s25 ultra 256go",
        "google pixel 10 pro 128go"
      ]);
      const onlyLegacy =
        queries.length > 0 && queries.length <= 3 && queries.every((q) => legacyDefaults.has(q));
      if (!hasAuto && onlyLegacy) {
        await this.db.run("delete from dashboard_searches where user_id = 1");
        const autoQueries = [
          "iphone pro max",
          "iphone pro",
          "samsung galaxy ultra",
          "samsung galaxy plus",
          "samsung galaxy fold",
          "samsung galaxy flip",
          "google pixel pro"
        ];
        for (const q of autoQueries) {
          await this.db.run(
            "insert into dashboard_searches (enabled, query, url, market, search_limit, sort, created_at, updated_at, user_id, is_default) values (1, ?, null, 'FR', 10, 'newest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 1)",
            [q]
          );
        }
      }
      await this.db.run(
        this.db.dialect === "postgres"
          ? "insert into dashboard_settings (key, value, secret, updated_at) values ('admin_autosearch_swap_2026_05', '1', 0, now())"
          : "insert into dashboard_settings (key, value, secret, updated_at) values ('admin_autosearch_swap_2026_05', '1', 0, CURRENT_TIMESTAMP)"
      );
    }

    // Recover zombie scan_runs left over from a process crash mid-scan. Any
    // row still flagged 'running' more than 30 minutes after `started_at`
    // is treated as abandoned. Runs every startup so the dashboard never
    // shows phantom "in progress" rows.
    await this.db.run(
      this.db.dialect === "postgres"
        ? "update scan_runs set status = 'failed', finished_at = CURRENT_TIMESTAMP, error = coalesce(error, 'abandoned by restart') where status = 'running' and started_at < CURRENT_TIMESTAMP - interval '30 minutes'"
        : "update scan_runs set status = 'failed', finished_at = CURRENT_TIMESTAMP, error = coalesce(error, 'abandoned by restart') where status = 'running' and started_at < datetime('now', '-30 minutes')"
    );

    // One-shot alignment of user-facing defaults with the bot's actual
    // hard-coded behavior. Earlier versions stored 0 for minSellerReviews/
    // Rating (misleading: the bot still rejected low-rating sellers) and a
    // 900s per-user poll interval (half of the bot config default → burned
    // 2x Apify credit). Only rewrites the exact legacy values so a user's
    // own tighter/looser pick is preserved.
    const alignFlag = await this.db.get(
      "select value from dashboard_settings where key = 'user_defaults_align_2026_05'"
    );
    if (!alignFlag) {
      await this.db.run(
        "update user_risk_rules set min_seller_reviews = 5 where min_seller_reviews = 0"
      );
      await this.db.run(
        "update user_risk_rules set min_seller_rating = 4.2 where min_seller_rating = 0"
      );
      await this.db.run(
        "update dashboard_risk_rules set min_seller_reviews = 5 where min_seller_reviews = 0"
      );
      await this.db.run(
        "update dashboard_risk_rules set min_seller_rating = 4.2 where min_seller_rating = 0"
      );
      await this.db.run(
        "update user_settings set poll_interval_seconds = 1800 where poll_interval_seconds = 900"
      );
      await this.db.run(
        this.db.dialect === "postgres"
          ? "insert into dashboard_settings (key, value, secret, updated_at) values ('user_defaults_align_2026_05', '1', 0, now())"
          : "insert into dashboard_settings (key, value, secret, updated_at) values ('user_defaults_align_2026_05', '1', 0, CURRENT_TIMESTAMP)"
      );
    }

    // Loosen exact legacy defaults from 5 reviews to 1 review. This preserves
    // users who already chose a stricter or looser value.
    const sellerReviewsFlag = await this.db.get(
      "select value from dashboard_settings where key = 'seller_reviews_loosen_2026_05'"
    );
    if (!sellerReviewsFlag) {
      try {
        await this.db.run(
          "update user_risk_rules set min_seller_reviews = 1 where min_seller_reviews = 5"
        );
        await this.db.run(
          "update dashboard_risk_rules set min_seller_reviews = 1 where min_seller_reviews = 5"
        );
        await this.db.run(
          this.db.dialect === "postgres"
            ? "insert into dashboard_settings (key, value, secret, updated_at) values ('seller_reviews_loosen_2026_05', '1', 0, now())"
            : "insert into dashboard_settings (key, value, secret, updated_at) values ('seller_reviews_loosen_2026_05', '1', 0, CURRENT_TIMESTAMP)"
        );
      } catch (error) {
        console.warn(`[dashboard] seller review default migration skipped: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
    if (this.db.dialect === "postgres") {
      await this.db.exec(`alter table ${table} add column if not exists ${column} ${definition}`);
      return;
    }
    const rows = await this.db.all(`pragma table_info(${table})`);
    if (rows.some((row) => row.name === column)) return;
    await this.db.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

function normalizeSearch(input: DashboardSearchInput): Required<DashboardSearchInput> {
  const query = (input.query ?? "").trim();
  const url = (input.url ?? "").trim();
  if (!query && !url) throw new Error("Search needs a query or url");
  return {
    enabled: input.enabled ?? true,
    query,
    url,
    market: "FR",
    limit: positiveInt(input.limit ?? 10, "limit"),
    sort: "newest"
  };
}

function normalizeModelRule(rule: ModelRule): ModelRule {
  const model = rule.model.trim();
  if (!model) throw new Error("Model rule needs a model name");
  const normalized: ModelRule = {
    model,
    enabled: Boolean(rule.enabled),
    storagesGb: [...new Set(rule.storagesGb.map((value) => positiveInt(value, "storageGb")))].sort((a, b) => a - b)
  };
  if (rule.maxFinalPrice !== undefined) normalized.maxFinalPrice = nonNegativeNumber(rule.maxFinalPrice, "maxFinalPrice");
  if (rule.minScore !== undefined) normalized.minScore = clampInt(rule.minScore, 0, 100, "minScore");
  if (rule.minDiscount !== undefined) normalized.minDiscount = fraction(rule.minDiscount, "minDiscount");
  if (rule.minSavings !== undefined) normalized.minSavings = nonNegativeNumber(rule.minSavings, "minSavings");
  return normalized;
}

function normalizeRiskRules(rules: RiskRules): RiskRules {
  const keywords = (rules.customExcludeKeywords ?? [])
    .map((keyword) => String(keyword).trim())
    .filter((keyword) => keyword.length > 0 && keyword.length <= 64);
  return {
    rejectHighRisks: Boolean(rules.rejectHighRisks),
    allowMissingImage: Boolean(rules.allowMissingImage),
    rejectNonOriginalScreen: Boolean(rules.rejectNonOriginalScreen),
    rejectScreenReplaced: Boolean(rules.rejectScreenReplaced),
    rejectMissingInvoice: Boolean(rules.rejectMissingInvoice),
    minSellerReviews: nonNegativeInt(rules.minSellerReviews, "minSellerReviews"),
    minSellerRating: clampNumber(rules.minSellerRating, 0, 5, "minSellerRating"),
    minBatteryHealth: clampInt(rules.minBatteryHealth, 0, 100, "minBatteryHealth"),
    ...(rules.maxBatteryHealth != null
      ? { maxBatteryHealth: clampInt(rules.maxBatteryHealth, 1, 100, "maxBatteryHealth") }
      : {}),
    allowedCountries: [...new Set(rules.allowedCountries.map((country) => country.trim().toUpperCase()).filter(Boolean))],
    customExcludeKeywords: [...new Set(keywords.map((keyword) => keyword.toLowerCase()))].slice(0, 50),
    customExcludeSeverity: rules.customExcludeSeverity === "high" || rules.customExcludeSeverity === "medium"
      ? rules.customExcludeSeverity
      : "reject",
    sellerBlocklist: dedupeLowercase(rules.sellerBlocklist ?? [], 100),
    sellerAllowlist: dedupeLowercase(rules.sellerAllowlist ?? [], 100),
    maxFavoriteCount: nonNegativeInt(rules.maxFavoriteCount ?? 0, "maxFavoriteCount"),
    maxListingAgeHours: nonNegativeInt(rules.maxListingAgeHours ?? 0, "maxListingAgeHours"),
    excludeVintedPro: Boolean(rules.excludeVintedPro),
    minSellerItems: nonNegativeInt(rules.minSellerItems ?? 0, "minSellerItems"),
    colorAllowlist: dedupeLowercase(rules.colorAllowlist ?? [], 30)
  };
}

function dedupeLowercase(items: string[], maxCount: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = String(item).trim();
    if (!trimmed || trimmed.length > 64) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
    if (out.length >= maxCount) break;
  }
  return out;
}

function searchFromRow(row: Record<string, unknown>): DashboardSearch {
  const search: DashboardSearch = {
    id: Number(row.id),
    enabled: Number(row.enabled) === 1,
    query: String(row.query ?? ""),
    market: "FR",
    limit: Number(row.search_limit),
    sort: "newest",
    isDefault: Number(row.is_default ?? 0) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
  if (typeof row.url === "string" && row.url) search.url = row.url;
  return search;
}

function modelRuleFromRow(row: Record<string, unknown>): ModelRule {
  const rule: ModelRule = {
    model: String(row.model),
    enabled: Number(row.enabled) === 1,
    storagesGb: parseNumberArray(row.storages_json)
  };
  const maxFinalPrice = optionalNumber(row.max_final_price);
  if (maxFinalPrice !== undefined) rule.maxFinalPrice = maxFinalPrice;
  const minScore = optionalNumber(row.min_score);
  if (minScore !== undefined) rule.minScore = minScore;
  const minDiscount = optionalNumber(row.min_discount);
  if (minDiscount !== undefined) rule.minDiscount = minDiscount;
  const minSavings = optionalNumber(row.min_savings);
  if (minSavings !== undefined) rule.minSavings = minSavings;
  return rule;
}

function riskRulesFromRow(row: Record<string, unknown>): RiskRules {
  const partial: RiskRules = {
    rejectHighRisks: Number(row.reject_high_risks) === 1,
    allowMissingImage: Number(row.allow_missing_image) === 1,
    rejectNonOriginalScreen: Number(row.reject_non_original_screen) === 1,
    rejectScreenReplaced: Number(row.reject_screen_replaced) === 1,
    rejectMissingInvoice: Number(row.reject_missing_invoice) === 1,
    minSellerReviews: Number(row.min_seller_reviews ?? 0),
    minSellerRating: Number(row.min_seller_rating ?? 0),
    minBatteryHealth: Number(row.min_battery_health ?? 80),
    allowedCountries: parseStringArray(row.allowed_countries_json),
    customExcludeKeywords: parseStringArray(row.custom_exclude_keywords_json),
    customExcludeSeverity: severityFromRow(row.custom_exclude_severity),
    sellerBlocklist: parseStringArray(row.seller_blocklist_json),
    sellerAllowlist: parseStringArray(row.seller_allowlist_json),
    maxFavoriteCount: Number(row.max_favorite_count ?? 0),
    maxListingAgeHours: Number(row.max_listing_age_hours ?? 0),
    excludeVintedPro: Number(row.exclude_vinted_pro ?? 0) === 1,
    minSellerItems: Number(row.min_seller_items ?? 0),
    colorAllowlist: parseStringArray(row.color_allowlist_json)
  };
  if (row.max_battery_health != null) partial.maxBatteryHealth = Number(row.max_battery_health);
  return normalizeRiskRules(partial);
}

function severityFromRow(value: unknown): RiskRules["customExcludeSeverity"] {
  if (value === "high" || value === "medium") return value;
  return "reject";
}

function userFromRow(row: Record<string, unknown>): User {
  const plan = row.plan === "pro" || row.plan === "admin" ? row.plan : "free";
  return {
    id: Number(row.id),
    discordId: String(row.discord_id),
    discordUsername: (row.discord_username as string | null) ?? null,
    discordAvatar: (row.discord_avatar as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    plan,
    dailyApifyQuota: Number(row.daily_apify_quota ?? 30),
    betaApproved: Number(row.beta_approved) === 1,
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at == null ? null : String(row.last_login_at),
    stripeCustomerId: row.stripe_customer_id == null ? null : String(row.stripe_customer_id),
    currentPeriodEnd: row.current_period_end == null ? null : String(row.current_period_end)
  };
}

/**
 * Today's date in Europe/Paris formatted as "YYYY-MM-DD". Anchors the daily
 * quota counter to the user base's local day so resets happen at Paris
 * midnight, not UTC midnight (which is 1-2 AM Paris depending on DST).
 */
export function parisDateISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
}

/**
 * UTC ISO timestamp of the next 00:00 in Europe/Paris. Used by the dashboard
 * to display "quota resets at ..." in the user's local time.
 */
export function nextParisMidnightUtcIso(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  // Candidate: UTC midnight of (tomorrow's Paris date). Then ask Intl what
  // Paris hour that corresponds to, and subtract so we land on 00:00 Paris.
  const candidate = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  const sampleHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false })
      .formatToParts(candidate)
      .find((p) => p.type === "hour")?.value ?? 0
  );
  return new Date(candidate.getTime() - sampleHour * 3600 * 1000).toISOString();
}

function userSettingsFromRow(row: Record<string, unknown>): UserSettings {
  return {
    userId: Number(row.user_id),
    discordWebhookConfigured: Number(row.discord_webhook_configured) === 1,
    discordWebhookDecryptError: false,
    dryRun: Number(row.dry_run) === 1,
    pollIntervalSeconds: Number(row.poll_interval_seconds ?? 900),
    minDiscountPct: row.min_discount_pct == null ? null : Number(row.min_discount_pct),
    maxProductPrice: row.max_product_price == null ? null : Number(row.max_product_price),
    updatedAt: String(row.updated_at)
  };
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function computeHoursSinceListed(listedAt: string | undefined): number | null {
  if (!listedAt) return null;
  const ts = Date.parse(listedAt);
  if (!Number.isFinite(ts)) return null;
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 0;
  return Math.round((diffMs / 3_600_000) * 10) / 10; // 1 decimal
}

function scanRunFromRow(row: Record<string, unknown>): ScanRunRecord {
  const record: ScanRunRecord = {
    id: Number(row.id),
    source: scanSource(row.source),
    status: scanStatus(row.status),
    startedAt: String(row.started_at),
    searchCount: Number(row.search_count),
    listings: Number(row.listings),
    scored: Number(row.scored),
    alertable: Number(row.alertable),
    sent: Number(row.sent),
    bestCandidate: String(row.best_candidate ?? "")
  };
  if (typeof row.finished_at === "string") record.finishedAt = row.finished_at;
  if (typeof row.error === "string") record.error = row.error;
  return record;
}

function dealCandidateFromRow(row: Record<string, unknown>): DealCandidateRecord {
  const record: DealCandidateRecord = {
    id: Number(row.id),
    listingId: String(row.listing_id),
    title: String(row.title),
    model: String(row.model),
    finalPrice: Number(row.final_price),
    benchmarkPrice: Number(row.benchmark_price),
    discountPercent: Number(row.discount_percent),
    savings: Number(row.savings),
    score: Number(row.score),
    shouldAlert: Number(row.should_alert) === 1,
    sent: Number(row.sent) === 1,
    url: String(row.url),
    riskLevel: String(row.risk_level),
    risks: parseRiskArray(row.risks_json),
    reasons: parseStringArray(row.reasons_json),
    rejectionReasons: parseStringArray(row.rejection_reasons_json),
    createdAt: String(row.created_at)
  };
  const scanRunId = optionalNumber(row.scan_run_id);
  if (scanRunId !== undefined) record.scanRunId = scanRunId;
  const storageGb = optionalNumber(row.storage_gb);
  if (storageGb !== undefined) record.storageGb = storageGb;
  if (typeof row.image_url === "string") record.imageUrl = row.image_url;
  if (typeof row.seller_name === "string") record.sellerName = row.seller_name;
  return record;
}

function logFromRow(row: Record<string, unknown>): DashboardLogRecord {
  return {
    id: Number(row.id),
    level: logLevel(row.level),
    message: String(row.message),
    createdAt: String(row.created_at)
  };
}

function riskLevel(deal: ScoredDeal): string {
  if (deal.risks.some((risk) => risk.severity === "reject")) return "reject";
  if (deal.risks.some((risk) => risk.severity === "high")) return "high";
  if (deal.risks.some((risk) => risk.severity === "medium")) return "medium";
  if (deal.risks.some((risk) => risk.severity === "low")) return "low";
  return "clean";
}

function parseNumberArray(value: unknown): number[] {
  const array = parseJsonArray(value);
  return array.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

function parseStringArray(value: unknown): string[] {
  const array = parseJsonArray(value);
  return array.filter((item): item is string => typeof item === "string");
}

function parseRiskArray(value: unknown): DealCandidateRecord["risks"] {
  return parseJsonArray(value)
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      code: String(item.code ?? ""),
      label: String(item.label ?? ""),
      severity: String(item.severity ?? "")
    }));
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function positiveInt(value: number, field: string): number {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${field} must be a positive integer`);
  return number;
}

function nonNegativeInt(value: number, field: string): number {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a non-negative integer`);
  return number;
}

function clampInt(value: number, min: number, max: number, field: string): number {
  return Math.floor(clampNumber(value, min, max, field));
}

function nonNegativeNumber(value: number, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a non-negative number`);
  return number;
}

function clampNumber(value: number, min: number, max: number, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be a number`);
  return Math.min(max, Math.max(min, number));
}

function fraction(value: number, field: string): number {
  return clampNumber(value, 0, 1, field);
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function requireHHMM(value: string, field: string): string {
  const text = String(value).trim();
  if (!HHMM_RE.test(text)) throw new Error(`${field} must be HH:MM (24h, e.g. 23:00)`);
  return text;
}

function validHHMMor(value: string, fallback: string): string {
  return HHMM_RE.test(value) ? value : fallback;
}

function scanSource(value: unknown): ScanRunRecord["source"] {
  return value === "manual" || value === "startup" ? value : "scheduled";
}

function scanStatus(value: unknown): ScanRunRecord["status"] {
  if (value === "running" || value === "success" || value === "failed" || value === "skipped") return value;
  return "failed";
}

function logLevel(value: unknown): DashboardLogRecord["level"] {
  if (value === "warn" || value === "error") return value;
  return "info";
}
