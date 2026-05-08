import type { Listing, PhoneMatch, RiskSignal, ScoredDeal } from "./types.js";
import { benchmarkKey, matchPhone } from "./phoneMatcher.js";
import { findRiskSignals, riskPenalty } from "./risk.js";

export interface HistoricalListing {
  benchmarkKey: string;
  price: number;
  listedAt?: string;
}

export interface AlertThreshold {
  minScore: number;
  minDiscount: number;
  minSavings: number;
}

export interface ModelRule {
  model: string;
  enabled: boolean;
  storagesGb: number[];
  maxFinalPrice?: number;
  minScore?: number;
  minDiscount?: number;
  minSavings?: number;
}

export interface RiskRules {
  rejectHighRisks: boolean;
  allowMissingImage: boolean;
  rejectNonOriginalScreen: boolean;
  rejectScreenReplaced: boolean;
  rejectMissingInvoice: boolean;
  minSellerReviews: number;
  minSellerRating: number;
  minBatteryHealth: number;
  allowedCountries: string[];
}

export interface ScoringOptions {
  minScore?: number;
  minDiscount?: number;
  minSavings?: number;
  modelRules?: ModelRule[];
  riskRules?: RiskRules;
}

const FALLBACK_MARKET_PRICES: Record<string, number> = {
  "iPhone 13 Pro|128": 390,
  "iPhone 13 Pro Max|128": 470,
  "iPhone 14 Pro|128": 560,
  "iPhone 14 Pro Max|128": 650,
  "iPhone 15 Pro|128": 720,
  "iPhone 15 Pro Max|256": 890,
  "iPhone 16 Pro|128": 900,
  "iPhone 16 Pro Max|256": 1080,
  "Samsung Galaxy S22 Ultra|128": 360,
  "Samsung Galaxy S23 Ultra|256": 560,
  "Samsung Galaxy S24 Ultra|256": 750,
  "Samsung Galaxy S25 Ultra|256": 920,
  "Samsung Galaxy Z Fold 4|256": 520,
  "Samsung Galaxy Z Fold 5|256": 720,
  "Samsung Galaxy Z Fold 6|256": 980,
  "Samsung Galaxy Z Flip 4|128": 300,
  "Samsung Galaxy Z Flip 5|256": 470,
  "Samsung Galaxy Z Flip 6|256": 620
};

const MIN_ALERT_SCORE = 82;
const MIN_ALERT_DISCOUNT = 0.22;
const MIN_ALERT_SAVINGS = 80;

export function scoreListings(listings: Listing[], history: HistoricalListing[], options: ScoringOptions = {}): ScoredDeal[] {
  const scanRisks = scanRiskMap(listings);
  return listings
    .map((listing) => scoreListing(listing, history, scanRisks.get(listing.id) ?? [], options))
    .filter((deal): deal is ScoredDeal => deal !== null)
    .sort((a, b) => b.score - a.score);
}

export function scoreListing(
  listing: Listing,
  history: HistoricalListing[],
  extraRisks: RiskSignal[] = [],
  options: ScoringOptions = {}
): ScoredDeal | null {
  const match = matchPhone(listing);
  if (!match) return null;

  const conditionBucket = normalizeCondition(listing.condition ?? listing.description);
  const key = benchmarkKey(match, conditionBucket);
  const benchmarkPrice = resolveBenchmark(match, key, history);
  if (!benchmarkPrice || benchmarkPrice <= 0) return null;

  const finalPrice = effectivePrice(listing);
  const dashboardRisks = dashboardRiskSignals(listing, options.riskRules);
  const baseRisks = [...findRiskSignals(listing), ...modelPriceRisks(finalPrice, match), ...extraRisks, ...dashboardRisks];
  const savings = Math.max(0, benchmarkPrice - finalPrice);
  const discountPercent = savings / benchmarkPrice;
  const risks = [...baseRisks, ...sellerRiskSignals(listing, discountPercent)];
  const penalty = riskPenalty(risks);
  const sellerScore = sellerConfidence(listing);
  const freshnessScore = freshness(listing);
  const discountScore = Math.min(45, discountPercent * 140);
  const savingsScore = Math.min(20, savings / 8);
  const matchScore = match.confidence * 15;
  const score = clamp(Math.round(discountScore + savingsScore + sellerScore + freshnessScore + matchScore - penalty), 0, 100);

  const modelRule = findModelRule(match, options.modelRules);
  const threshold = alertThreshold(match, options, modelRule);
  const rejectionReasons = dealRejectionReasons({
    match,
    finalPrice,
    discountPercent,
    savings,
    score,
    risks,
    threshold,
    modelRule,
    riskRules: options.riskRules
  });

  return {
    listing,
    match,
    benchmarkPrice,
    finalPrice,
    discountPercent,
    savings,
    score,
    risks,
    reasons: dealReasons(discountPercent, savings, sellerScore, freshnessScore, risks),
    rejectionReasons,
    shouldAlert: rejectionReasons.length === 0
  };
}

export function normalizeCondition(value = ""): string {
  const text = value.toLowerCase();
  if (/\b(neuf|new with tags|new|jamais servi|scell[eé])\b/.test(text)) return "new";
  if (/\b(tr[eè]s bon|very good|excellent|comme neuf)\b/.test(text)) return "very-good";
  if (/\b(bon|good|correct)\b/.test(text)) return "good";
  if (/\b(satisfaisant|fair|us[eé])\b/.test(text)) return "fair";
  return "unknown";
}

export function resolveBenchmark(match: PhoneMatch, key: string, history: HistoricalListing[]): number {
  const fallback = fallbackPrice(match);
  const floor = modelPriceFloor(match) ?? 100;
  const exact = historyPrices(history, (entry) => entry.benchmarkKey === key, floor);
  const relatedPrefix = benchmarkPrefix(key);
  const related = historyPrices(
    history,
    (entry) => entry.benchmarkKey !== key && entry.benchmarkKey.startsWith(relatedPrefix),
    floor
  );

  const estimate = historyEstimate(exact, related);
  if (!estimate) return fallback ?? 0;
  if (!fallback) return estimate.price;

  const historyWeight = Math.min(0.7, estimate.effectiveSampleSize / 20);
  const blended = estimate.price * historyWeight + fallback * (1 - historyWeight);
  return Math.round(clamp(blended, fallback * 0.75, fallback * 1.25));
}

export function effectivePrice(listing: Listing): number {
  if (listing.totalPrice !== undefined && listing.totalPrice > listing.price) return listing.totalPrice;
  return Math.round((listing.price * 1.05 + 4) * 100) / 100;
}

function fallbackPrice(match: PhoneMatch): number | undefined {
  const storage = match.storageGb ?? defaultStorage(match);
  const exact = FALLBACK_MARKET_PRICES[`${match.model}|${storage}`];
  if (exact !== undefined) return exact;

  const sameModel = Object.entries(FALLBACK_MARKET_PRICES)
    .map(([key, price]) => {
      const [model, storageText] = key.split("|");
      return { model, storage: Number(storageText), price };
    })
    .filter((entry) => entry.model === match.model && Number.isFinite(entry.storage));

  if (sameModel.length === 0) return undefined;

  const nearest = sameModel.reduce((best, current) => {
    return Math.abs(current.storage - storage) < Math.abs(best.storage - storage) ? current : best;
  });

  return Math.max(120, Math.round(nearest.price + storageAdjustment(nearest.storage, storage, match)));
}

function defaultStorage(match: PhoneMatch): number {
  if (match.model.includes("Pro Max") || match.model.includes("Ultra") || match.model.includes("Fold")) return 256;
  return 128;
}

function storageAdjustment(fromStorage: number, toStorage: number, match: PhoneMatch): number {
  if (fromStorage === toStorage) return 0;

  const ordered = [64, 128, 256, 512, 1024];
  const fromIndex = ordered.indexOf(fromStorage);
  const toIndex = ordered.indexOf(toStorage);
  if (fromIndex === -1 || toIndex === -1) return 0;

  const stepValue = match.brand === "apple" ? 85 : 65;
  return (toIndex - fromIndex) * stepValue;
}

function modelPriceRisks(finalPrice: number, match: PhoneMatch): RiskSignal[] {
  const floor = modelPriceFloor(match);
  if (!floor || finalPrice >= floor) return [];
  return [{
    code: "below-logical-market-floor",
    label: `below logical market floor (${floor} EUR)`,
    severity: "reject"
  }];
}

function alertThreshold(match: PhoneMatch, options: ScoringOptions, modelRule: ModelRule | undefined): AlertThreshold {
  const threshold: AlertThreshold = {
    minScore: MIN_ALERT_SCORE,
    minDiscount: MIN_ALERT_DISCOUNT,
    minSavings: MIN_ALERT_SAVINGS
  };

  if (match.brand === "samsung") {
    threshold.minDiscount = 0.24;
    threshold.minSavings = 90;
  }

  if (match.tier === "fold") {
    threshold.minScore = 84;
    threshold.minSavings = 120;
  }

  if ((match.brand === "apple" && match.generation >= 16) || match.model.includes("S25")) {
    threshold.minSavings = 120;
  }

  if (options.minScore !== undefined) threshold.minScore = options.minScore;
  if (options.minDiscount !== undefined) threshold.minDiscount = options.minDiscount;
  if (options.minSavings !== undefined) threshold.minSavings = options.minSavings;
  if (modelRule?.minScore !== undefined) threshold.minScore = modelRule.minScore;
  if (modelRule?.minDiscount !== undefined) threshold.minDiscount = modelRule.minDiscount;
  if (modelRule?.minSavings !== undefined) threshold.minSavings = modelRule.minSavings;

  return threshold;
}

function findModelRule(match: PhoneMatch, rules: ModelRule[] | undefined): ModelRule | undefined {
  return rules?.find((rule) => rule.model === match.model);
}

function dealRejectionReasons({
  match,
  finalPrice,
  discountPercent,
  savings,
  score,
  risks,
  threshold,
  modelRule,
  riskRules
}: {
  match: PhoneMatch;
  finalPrice: number;
  discountPercent: number;
  savings: number;
  score: number;
  risks: RiskSignal[];
  threshold: AlertThreshold;
  modelRule: ModelRule | undefined;
  riskRules: RiskRules | undefined;
}): string[] {
  const reasons: string[] = [];

  if (modelRule?.enabled === false) {
    reasons.push(`${match.model} disabled in dashboard rules`);
  }

  const storage = match.storageGb ?? defaultStorage(match);
  if (modelRule && modelRule.storagesGb.length > 0 && !modelRule.storagesGb.includes(storage)) {
    reasons.push(`${storage}GB storage is not enabled for ${match.model}`);
  }

  if (modelRule?.maxFinalPrice !== undefined && finalPrice > modelRule.maxFinalPrice) {
    reasons.push(`final price above dashboard max (${Math.round(modelRule.maxFinalPrice)} EUR)`);
  }

  const blockingRisks = risks.filter((risk) => isBlockingRisk(risk, riskRules));
  if (blockingRisks.length > 0) {
    reasons.push(...blockingRisks.map((risk) => `blocked risk: ${risk.label}`));
  }

  if (score < threshold.minScore) {
    reasons.push(`score below ${threshold.minScore}`);
  }
  if (discountPercent < threshold.minDiscount) {
    reasons.push(`discount below ${Math.round(threshold.minDiscount * 100)}%`);
  }
  if (savings < threshold.minSavings) {
    reasons.push(`savings below ${Math.round(threshold.minSavings)} EUR`);
  }

  return [...new Set(reasons)];
}

function isBlockingRisk(risk: RiskSignal, rules: RiskRules | undefined): boolean {
  if (risk.severity === "reject") return true;
  if (rules?.allowMissingImage && risk.code === "missing-image") return false;
  if (rules?.rejectNonOriginalScreen === false && risk.code === "non-original-screen") return false;
  if (risk.severity !== "high") return false;
  return rules?.rejectHighRisks ?? true;
}

function dashboardRiskSignals(listing: Listing, rules: RiskRules | undefined): RiskSignal[] {
  if (!rules) return [];

  const signals: RiskSignal[] = [];
  const reviews = listing.sellerReviews ?? 0;
  if (rules.minSellerReviews > 0 && reviews < rules.minSellerReviews) {
    signals.push({
      code: "dashboard-min-seller-reviews",
      label: `seller has fewer than ${rules.minSellerReviews} reviews`,
      severity: "high"
    });
  }

  const rating = listing.sellerRating ?? 0;
  if (rules.minSellerRating > 0 && rating < rules.minSellerRating) {
    signals.push({
      code: "dashboard-min-seller-rating",
      label: `seller rating below ${rules.minSellerRating}`,
      severity: "high"
    });
  }

  if (rules.allowedCountries.length > 0) {
    const itemCountry = (listing.itemCountry ?? listing.sellerCountry ?? "").toUpperCase();
    if (itemCountry && !rules.allowedCountries.includes(itemCountry)) {
      signals.push({
        code: "dashboard-country-not-allowed",
        label: `country ${itemCountry} is not allowed`,
        severity: "high"
      });
    }
  }

  const text = [listing.title, listing.description, listing.condition].filter(Boolean).join(" ");
  const batteryHealth = extractBatteryHealth(text);
  if (batteryHealth !== undefined && rules.minBatteryHealth > 0 && batteryHealth < rules.minBatteryHealth) {
    signals.push({
      code: "dashboard-min-battery-health",
      label: `battery health below ${rules.minBatteryHealth}%`,
      severity: "high"
    });
  }

  if (rules.rejectScreenReplaced && /\b(?:ecran|[eé]cran|screen)\s*(?:chang[eé]?|remplac[eé]?)\b/i.test(text)) {
    signals.push({
      code: "dashboard-screen-replaced-blocked",
      label: "screen replacement blocked by dashboard",
      severity: "high"
    });
  }

  if (rules.rejectMissingInvoice && /\b(?:sans\s*facture|no\s*invoice|facture\s*perdue)\b/i.test(text)) {
    signals.push({
      code: "dashboard-missing-invoice-blocked",
      label: "missing invoice blocked by dashboard",
      severity: "high"
    });
  }

  return signals;
}

function sellerRiskSignals(listing: Listing, discountPercent: number): RiskSignal[] {
  const reviews = listing.sellerReviews ?? 0;
  const hasRating = listing.sellerRating !== undefined;
  const signals: RiskSignal[] = [];

  if (reviews === 0 && !hasRating) {
    signals.push({
      code: "seller-has-no-feedback",
      label: "seller has no feedback",
      severity: discountPercent >= 0.3 ? "high" : "medium"
    });
  } else if (reviews < 3 && discountPercent >= 0.3) {
    signals.push({
      code: "seller-history-too-weak-for-discount",
      label: "seller history too weak for discount",
      severity: "high"
    });
  }

  if (listing.sellerItemCount !== undefined && listing.sellerItemCount > 150) {
    signals.push({
      code: "seller-has-too-many-active-items",
      label: "seller has unusually many active items",
      severity: "medium"
    });
  }

  const ageDays = sellerAccountAgeDays(listing.sellerJoinedAt);
  if (ageDays !== undefined && ageDays < 30) {
    signals.push({
      code: "seller-account-too-new",
      label: "seller account is very new",
      severity: discountPercent >= 0.25 ? "high" : "medium"
    });
  } else if (ageDays !== undefined && ageDays < 90 && discountPercent >= 0.3) {
    signals.push({
      code: "seller-account-new-for-discount",
      label: "seller account is new for this discount",
      severity: "medium"
    });
  }

  if (listing.sellerCountry && listing.itemCountry && listing.sellerCountry !== listing.itemCountry) {
    signals.push({
      code: "seller-item-country-mismatch",
      label: "seller country differs from item country",
      severity: discountPercent >= 0.35 ? "high" : "medium"
    });
  }

  if (listing.description.trim().length < 20) {
    signals.push({
      code: "description-too-short",
      label: "description too short",
      severity: "medium"
    });
  }

  return signals;
}

function sellerAccountAgeDays(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, (Date.now() - timestamp) / 864e5);
}

function extractBatteryHealth(text: string): number | undefined {
  const patterns = [
    /\b(?:batterie|battery)[^\d]{0,20}(\d{2,3})\s?%/i,
    /\b(\d{2,3})\s?%[^\w]{0,20}(?:batterie|battery)\b/i
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1] ? Number(match[1]) : Number.NaN;
    if (Number.isFinite(value) && value <= 100) return value;
  }

  return undefined;
}

function modelPriceFloor(match: PhoneMatch): number | undefined {
  const floors: Record<string, number> = {
    "iPhone 13 Pro": 260,
    "iPhone 13 Pro Max": 320,
    "iPhone 14 Pro": 380,
    "iPhone 14 Pro Max": 450,
    "iPhone 15 Pro": 450,
    "iPhone 15 Pro Max": 550,
    "iPhone 16 Pro": 600,
    "iPhone 16 Pro Max": 750,
    "Samsung Galaxy S22 Ultra": 260,
    "Samsung Galaxy S23 Ultra": 380,
    "Samsung Galaxy S24 Ultra": 450,
    "Samsung Galaxy S25 Ultra": 650,
    "Samsung Galaxy Z Fold 4": 350,
    "Samsung Galaxy Z Fold 5": 500,
    "Samsung Galaxy Z Fold 6": 650,
    "Samsung Galaxy Z Flip 4": 220,
    "Samsung Galaxy Z Flip 5": 320,
    "Samsung Galaxy Z Flip 6": 380
  };
  return floors[match.model];
}

function sellerConfidence(listing: Listing): number {
  const reviews = listing.sellerReviews ?? 0;
  const rating = listing.sellerRating ?? 0;
  if (reviews >= 30 && rating >= 4.7) return 13;
  if (reviews >= 10 && rating >= 4.5) return 10;
  if (reviews >= 5 && rating >= 4.2) return 7;
  if (reviews === 0 && rating === 0) return 0;
  return 4;
}

function scanRiskMap(listings: Listing[]): Map<string, RiskSignal[]> {
  const risks = new Map<string, RiskSignal[]>();
  const sellerModelGroups = new Map<string, Listing[]>();
  const imageGroups = new Map<string, Listing[]>();

  for (const listing of listings) {
    const match = matchPhone(listing);
    if (!match) continue;

    const seller = sellerKey(listing);
    if (seller) {
      const key = [seller, match.model, match.storageGb ?? defaultStorage(match)].join("|");
      const group = sellerModelGroups.get(key) ?? [];
      group.push(listing);
      sellerModelGroups.set(key, group);
    }

    if (listing.imageUrl) {
      const key = listing.imageUrl.trim().toLowerCase();
      const group = imageGroups.get(key) ?? [];
      group.push(listing);
      imageGroups.set(key, group);
    }
  }

  for (const group of sellerModelGroups.values()) {
    if (group.length < 3) continue;
    for (const listing of group) {
      addScanRisk(risks, listing.id, {
        code: "seller-repeats-same-model-in-scan",
        label: "seller repeats same model in current scan",
        severity: "medium"
      });
    }
  }

  for (const group of imageGroups.values()) {
    if (group.length < 2) continue;
    const sellers = new Set(group.map(sellerKey).filter(Boolean));
    const severity: RiskSignal["severity"] = sellers.size > 1 ? "high" : "medium";
    for (const listing of group) {
      addScanRisk(risks, listing.id, {
        code: "duplicate-photo-in-current-scan",
        label: "duplicate photo appears in current scan",
        severity
      });
    }
  }

  return risks;
}

function addScanRisk(risks: Map<string, RiskSignal[]>, listingId: string, risk: RiskSignal): void {
  const existing = risks.get(listingId) ?? [];
  if (!existing.some((item) => item.code === risk.code)) existing.push(risk);
  risks.set(listingId, existing);
}

function sellerKey(listing: Listing): string {
  return (listing.sellerProfileUrl ?? listing.sellerName ?? "").trim().toLowerCase();
}

function freshness(listing: Listing): number {
  if (!listing.listedAt) return 4;
  const timestamp = Date.parse(listing.listedAt);
  if (!Number.isFinite(timestamp)) return 4;
  const hours = (Date.now() - timestamp) / 36e5;
  if (hours <= 2) return 7;
  if (hours <= 12) return 5;
  if (hours <= 48) return 3;
  return 1;
}

function dealReasons(
  discountPercent: number,
  savings: number,
  sellerScore: number,
  freshnessScore: number,
  risks: RiskSignal[]
): string[] {
  const reasons = [
    `${Math.round(discountPercent * 100)}% below benchmark`,
    `${Math.round(savings)} EUR estimated savings`
  ];
  if (sellerScore >= 10) reasons.push("seller has strong feedback");
  if (freshnessScore >= 5) reasons.push("fresh listing");
  if (risks.length) reasons.push(`risk notes: ${risks.map((risk) => risk.label).join(", ")}`);
  return reasons;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index] ?? 0;
}

function historyPrices(
  history: HistoricalListing[],
  predicate: (entry: HistoricalListing) => boolean,
  floor: number
): number[] {
  return history
    .filter((entry) => predicate(entry) && Number.isFinite(entry.price) && entry.price >= floor)
    .map((entry) => entry.price)
    .sort((a, b) => a - b);
}

function historyEstimate(exact: number[], related: number[]): { price: number; effectiveSampleSize: number } | null {
  const exactMedian = exact.length > 0 ? percentile(trimOutliers(exact), 0.5) : 0;
  const relatedMedian = related.length > 0 ? percentile(trimOutliers(related), 0.5) : 0;

  if (exact.length >= 3 || related.length === 0) {
    return exact.length > 0 ? { price: exactMedian, effectiveSampleSize: exact.length } : null;
  }

  if (exact.length === 0) {
    return { price: relatedMedian, effectiveSampleSize: related.length * 0.5 };
  }

  const relatedWeight = related.length * 0.35;
  const exactWeight = exact.length;
  const totalWeight = exactWeight + relatedWeight;
  return {
    price: Math.round((exactMedian * exactWeight + relatedMedian * relatedWeight) / totalWeight),
    effectiveSampleSize: totalWeight
  };
}

function benchmarkPrefix(key: string): string {
  return `${key.split("|").slice(0, 4).join("|")}|`;
}

function trimOutliers(sorted: number[]): number[] {
  if (sorted.length < 8) return sorted;
  const low = percentile(sorted, 0.1);
  const high = percentile(sorted, 0.9);
  const trimmed = sorted.filter((price) => price >= low && price <= high);
  return trimmed.length > 0 ? trimmed : sorted;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
