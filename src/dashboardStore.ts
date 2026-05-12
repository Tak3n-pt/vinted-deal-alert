import type { RuntimeConfig, ScoredDeal, SearchConfig } from "./types.js";
import { openSqlDatabase, type SqlDatabase } from "./sqlDatabase.js";
import type {
  DashboardLogRecord,
  DashboardRuntimeSnapshot,
  DashboardSearch,
  DashboardSearchInput,
  DashboardSecrets,
  DashboardSettingsInput,
  DashboardSettingsView,
  DealCandidateRecord,
  ModelRule,
  RiskRules,
  ScanRunRecord
} from "./dashboardTypes.js";

const DEFAULT_MIN_SCORE = 82;
const DEFAULT_MIN_DISCOUNT = 0.22;
const DEFAULT_MIN_SAVINGS = 80;
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
  minSellerReviews: 0,
  minSellerRating: 0,
  minBatteryHealth: 80,
  allowedCountries: [],
  customExcludeKeywords: [],
  customExcludeSeverity: "reject"
};

export class DashboardStore {
  private constructor(private readonly db: SqlDatabase) {}

  static async open(databasePath: string): Promise<DashboardStore> {
    const store = new DashboardStore(await openSqlDatabase(databasePath));
    await store.migrate();
    return store;
  }

  async ensureDefaults(searches: SearchConfig[]): Promise<void> {
    const searchRow = await this.db.get("select count(*) as count from dashboard_searches");
    if (Number(searchRow?.count ?? 0) === 0) {
      for (const search of searches) await this.createSearch(search);
    }

    const modelRow = await this.db.get("select count(*) as count from dashboard_model_rules");
    if (Number(modelRow?.count ?? 0) === 0) {
      await this.replaceModelRules(DEFAULT_MODEL_RULES);
    } else {
      await this.ensureMissingModelRules();
    }

    const riskRow = await this.db.get("select count(*) as count from dashboard_risk_rules");
    if (Number(riskRow?.count ?? 0) === 0) {
      await this.updateRiskRules(DEFAULT_RISK_RULES);
    }
  }

  async restoreDefaults(searches: SearchConfig[]): Promise<void> {
    await this.db.exec("delete from dashboard_searches; delete from dashboard_model_rules; delete from dashboard_risk_rules;");
    await this.ensureDefaults(searches);
    await this.log("info", "Règles restaurées par défaut");
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

  async runtimeSnapshot(baseConfig: RuntimeConfig, fallbackSearches: SearchConfig[]): Promise<DashboardRuntimeSnapshot> {
    const view = await this.settingsView(baseConfig);
    const secrets = await this.secrets();
    const config: RuntimeConfig = {
      providerType: view.providerType,
      authorizedDataApiUrl: view.authorizedDataApiUrl,
      authorizedDataApiKey: secrets.authorizedDataApiKey ?? baseConfig.authorizedDataApiKey,
      apifyActorId: view.apifyActorId,
      discordWebhookUrl: secrets.discordWebhookUrl ?? baseConfig.discordWebhookUrl,
      pollIntervalSeconds: view.pollIntervalSeconds,
      providerTimeoutSeconds: view.providerTimeoutSeconds,
      maxProductsPerScan: view.maxProductsPerScan,
      heartbeatEveryScans: view.heartbeatEveryScans,
      databasePath: baseConfig.databasePath,
      runOnStart: view.runOnStart,
      dryRun: view.dryRun
    };
    const apifyToken = secrets.apifyToken ?? baseConfig.apifyToken;
    if (apifyToken) config.apifyToken = apifyToken;

    const configuredSearches = await this.activeSearches();
    const searches = configuredSearches.length > 0 ? configuredSearches : fallbackSearches;
    return {
      config,
      searches,
      scoringOptions: {
        minScore: view.minScore,
        minDiscount: view.minDiscount,
        minSavings: view.minSavings,
        modelRules: await this.listModelRules(),
        riskRules: await this.getRiskRules()
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

  async listSearches(): Promise<DashboardSearch[]> {
    return (await this.db.all("select * from dashboard_searches order by id asc")).map(searchFromRow);
  }

  async activeSearches(): Promise<SearchConfig[]> {
    return (await this.listSearches())
      .filter((search) => search.enabled)
      .map((search) => ({
        market: search.market,
        query: search.query,
        limit: search.limit,
        sort: search.sort,
        ...(search.url ? { url: search.url } : {})
      }));
  }

  async createSearch(input: DashboardSearchInput, fallbackCap?: number): Promise<DashboardSearch> {
    const normalized = normalizeSearch(input);
    await this.assertSearchBudget(undefined, normalized, fallbackCap);
    const id = await this.db.insert(
      `insert into dashboard_searches
        (enabled, query, url, market, search_limit, sort, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [normalized.enabled ? 1 : 0, normalized.query, normalized.url ?? null, normalized.market, normalized.limit, normalized.sort]
    );
    await this.log("info", `Recherche créée : ${normalized.query || normalized.url || "url"}`);
    return this.getSearch(id);
  }

  async updateSearch(id: number, input: DashboardSearchInput, fallbackCap?: number): Promise<DashboardSearch> {
    const existing = await this.getSearch(id);
    const normalized = normalizeSearch({ ...existing, ...input });
    await this.assertSearchBudget(id, normalized, fallbackCap);
    await this.db.run(
      `update dashboard_searches
       set enabled = ?, query = ?, url = ?, market = ?, search_limit = ?, sort = ?, updated_at = CURRENT_TIMESTAMP
       where id = ?`,
      [normalized.enabled ? 1 : 0, normalized.query, normalized.url ?? null, normalized.market, normalized.limit, normalized.sort, id]
    );
    await this.log("info", `Recherche mise à jour : ${normalized.query || normalized.url || "url"}`);
    return this.getSearch(id);
  }

  /**
   * Reject saves that would push the sum of *enabled* search limits above the
   * configured `maxProductsPerScan`. Catches misconfigurations at save time
   * instead of letting the next scheduled scan blow up silently.
   *
   * The cap is resolved from `dashboard_settings` first (the runtime override),
   * falling back to the caller-supplied default (typically `baseConfig.maxProductsPerScan`)
   * so a fresh install with no DB rows still gets the same gate the bot
   * itself uses.
   */
  private async assertSearchBudget(
    updatingId: number | undefined,
    candidate: Required<DashboardSearchInput>,
    fallbackCap: number | undefined
  ): Promise<void> {
    if (!candidate.enabled) return;
    const row = await this.db.get("select value from dashboard_settings where key = 'maxProductsPerScan'");
    let cap = Number(row?.value ?? Number.NaN);
    if (!Number.isFinite(cap) || cap <= 0) cap = Number(fallbackCap ?? Number.NaN);
    if (!Number.isFinite(cap) || cap <= 0) return;
    const others = await this.db.all(
      updatingId === undefined
        ? "select search_limit from dashboard_searches where enabled = 1"
        : "select search_limit from dashboard_searches where enabled = 1 and id <> ?",
      updatingId === undefined ? [] : [updatingId]
    );
    const total = others.reduce((sum, r) => sum + Number(r.search_limit ?? 0), 0) + candidate.limit;
    if (total > cap) {
      throw new Error(
        `Budget dépassé : ${total} produits demandés au total alors que MAX_PRODUCTS_PER_SCAN=${cap}. ` +
          `Réduire la limite de cette recherche, désactiver une autre, ou augmenter la limite globale.`
      );
    }
  }

  async deleteSearch(id: number): Promise<void> {
    const result = await this.db.run("delete from dashboard_searches where id = ?", [id]);
    if (result.changes === 0) throw new Error("Search not found");
    await this.log("warn", `Recherche supprimée : ${id}`);
  }

  async listModelRules(): Promise<ModelRule[]> {
    return (await this.db.all("select * from dashboard_model_rules order by model asc")).map(modelRuleFromRow);
  }

  async replaceModelRules(rules: ModelRule[]): Promise<ModelRule[]> {
    await this.db.transaction(async () => {
      await this.db.run("delete from dashboard_model_rules");
      for (const rule of rules) {
        await this.insertModelRule(normalizeModelRule(rule));
      }
    });
    await this.log("info", "Règles des modèles mises à jour");
    return this.listModelRules();
  }

  async getRiskRules(): Promise<RiskRules> {
    const row = await this.db.get("select * from dashboard_risk_rules where id = 1");
    return row ? riskRulesFromRow(row) : { ...DEFAULT_RISK_RULES };
  }

  async updateRiskRules(input: Partial<RiskRules>): Promise<RiskRules> {
    const current = await this.getRiskRules();
    const normalized = normalizeRiskRules({ ...current, ...input });
    await this.db.run(
      `insert into dashboard_risk_rules
        (id, reject_high_risks, allow_missing_image, reject_non_original_screen, reject_screen_replaced,
         reject_missing_invoice, min_seller_reviews, min_seller_rating, min_battery_health,
         allowed_countries_json, custom_exclude_keywords_json, custom_exclude_severity, updated_at)
       values (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       on conflict(id) do update set
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
         updated_at = CURRENT_TIMESTAMP`,
      [
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
        normalized.customExcludeSeverity
      ]
    );
    await this.log("info", "Règles de risque mises à jour");
    return this.getRiskRules();
  }

  async startScanRun(source: ScanRunRecord["source"], searchCount: number): Promise<number> {
    return this.db.insert(
      `insert into scan_runs
        (source, status, started_at, search_count, listings, scored, alertable, sent, best_candidate)
       values (?, 'running', CURRENT_TIMESTAMP, ?, 0, 0, 0, 0, '')`,
      [source, searchCount]
    );
  }

  async completeScanRun(
    id: number,
    status: ScanRunRecord["status"],
    result: { listings: number; scored: number; alertable: number; sent: number; bestCandidate: string },
    error?: string
  ): Promise<void> {
    await this.db.run(
      `update scan_runs
       set status = ?, finished_at = CURRENT_TIMESTAMP, listings = ?, scored = ?, alertable = ?,
           sent = ?, best_candidate = ?, error = ?
       where id = ?`,
      [status, result.listings, result.scored, result.alertable, result.sent, result.bestCandidate, error ?? null, id]
    );
    await this.log(status === "failed" ? "error" : "info", `Scan ${status === "failed" ? "échoué" : "réussi"} : ${result.listings} annonces, ${result.sent} alertes envoyées`);
  }

  async recordDealCandidates(scanRunId: number | undefined, deals: ScoredDeal[], sentIds: Set<string>): Promise<void> {
    if (deals.length === 0) return;
    await this.db.transaction(async () => {
      for (const deal of deals) {
        await this.db.run(
          `insert into deal_candidates
            (scan_run_id, listing_id, title, model, storage_gb, final_price, benchmark_price,
             discount_percent, savings, score, should_alert, sent, url, image_url, seller_name,
             risk_level, risks_json, reasons_json, rejection_reasons_json, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
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
            JSON.stringify(deal.rejectionReasons)
          ]
        );
      }
    });
  }

  async pruneRetention(options: { dealCandidatesKeep: number; logsKeep: number; scanRunsKeep: number }): Promise<void> {
    await this.deleteExceeding("deal_candidates", options.dealCandidatesKeep);
    await this.deleteExceeding("dashboard_logs", options.logsKeep);
    await this.deleteExceeding("scan_runs", options.scanRunsKeep);
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

  async listScanRuns(limit = 50): Promise<ScanRunRecord[]> {
    return (await this.db.all("select * from scan_runs order by id desc limit ?", [clampInt(limit, 1, 200, "limit")])).map(scanRunFromRow);
  }

  async listDealCandidates(limit = 100): Promise<DealCandidateRecord[]> {
    return (await this.db.all("select * from deal_candidates order by id desc limit ?", [clampInt(limit, 1, 300, "limit")])).map(dealCandidateFromRow);
  }

  async listLogs(limit = 100): Promise<DashboardLogRecord[]> {
    return (await this.db.all("select * from dashboard_logs order by id desc limit ?", [clampInt(limit, 1, 300, "limit")])).map(logFromRow);
  }

  async log(level: DashboardLogRecord["level"], message: string): Promise<void> {
    await this.db.run("insert into dashboard_logs (level, message, created_at) values (?, ?, CURRENT_TIMESTAMP)", [level, message]);
  }

  async createSession(tokenHash: string, expiresAt: string): Promise<void> {
    await this.db.run("insert into admin_sessions (token_hash, expires_at, created_at) values (?, ?, CURRENT_TIMESTAMP)", [tokenHash, expiresAt]);
  }

  async validateSession(tokenHash: string): Promise<boolean> {
    const expirationSql = this.db.dialect === "postgres" ? "expires_at <= CURRENT_TIMESTAMP" : "expires_at <= datetime('now')";
    await this.db.run(`delete from admin_sessions where ${expirationSql}`);
    const row = await this.db.get("select token_hash from admin_sessions where token_hash = ?", [tokenHash]);
    return Boolean(row);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.run("delete from admin_sessions where token_hash = ?", [tokenHash]);
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  private async getSearch(id: number): Promise<DashboardSearch> {
    const row = await this.db.get("select * from dashboard_searches where id = ?", [id]);
    if (!row) throw new Error("Search not found");
    return searchFromRow(row);
  }

  private async ensureMissingModelRules(): Promise<void> {
    const rows = await this.db.all("select model from dashboard_model_rules");
    const existing = new Set(rows.map((row) => String(row.model)));
    let inserted = 0;
    for (const rule of DEFAULT_MODEL_RULES) {
      if (existing.has(rule.model)) continue;
      await this.insertModelRule(normalizeModelRule(rule));
      inserted += 1;
    }
    if (inserted > 0) await this.log("info", `${inserted} nouveaux modèles ajoutés aux règles`);
  }

  private async insertModelRule(normalized: ModelRule): Promise<void> {
    await this.db.run(
      `insert into dashboard_model_rules
        (model, enabled, storages_json, max_final_price, min_score, min_discount, min_savings, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
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
        on conflict (discord_id) do nothing;

        create table if not exists user_settings (
          user_id bigint primary key references users(id) on delete cascade,
          discord_webhook_enc text,
          discord_webhook_configured integer not null default 0,
          dry_run integer not null default 0,
          poll_interval_seconds integer not null default 900,
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
          poll_interval_seconds integer not null default 900,
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
    await this.addColumnIfMissing("dashboard_model_rules", "user_id", userIdColumn);
    await this.addColumnIfMissing("scan_runs", "user_id", userIdColumn);
    await this.addColumnIfMissing("deal_candidates", "user_id", userIdColumn);
    await this.addColumnIfMissing("admin_sessions", "user_id", userIdColumn);
    await this.addColumnIfMissing("dashboard_logs", "user_id", userIdColumn);

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
    allowedCountries: [...new Set(rules.allowedCountries.map((country) => country.trim().toUpperCase()).filter(Boolean))],
    customExcludeKeywords: [...new Set(keywords.map((keyword) => keyword.toLowerCase()))].slice(0, 50),
    customExcludeSeverity: rules.customExcludeSeverity === "high" || rules.customExcludeSeverity === "medium"
      ? rules.customExcludeSeverity
      : "reject"
  };
}

function searchFromRow(row: Record<string, unknown>): DashboardSearch {
  const search: DashboardSearch = {
    id: Number(row.id),
    enabled: Number(row.enabled) === 1,
    query: String(row.query ?? ""),
    market: "FR",
    limit: Number(row.search_limit),
    sort: "newest",
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
  return normalizeRiskRules({
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
    customExcludeSeverity: severityFromRow(row.custom_exclude_severity)
  });
}

function severityFromRow(value: unknown): RiskRules["customExcludeSeverity"] {
  if (value === "high" || value === "medium") return value;
  return "reject";
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
