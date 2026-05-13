// Pure aggregation helpers for the Statistiques dashboard view.
// All inputs are raw DB rows; outputs are typed AnalyticsSnapshot.

export interface AnalyticsSnapshot {
  rangeDays: number;
  generatedAt: string;
  summary: {
    moneySaved: number;       // sum(savings) where sent=1
    totalAlerts: number;      // count where sent=1
    totalDeals: number;       // count of all candidates
    avgScore: number;         // avg(score) of sent
    avgSavings: number;       // avg(savings) of sent
    avgDiscountPct: number;   // avg(discount_percent) * 100
    bestDeal: {
      model: string;
      finalPrice: number;
      savings: number;
      score: number;
      url: string;
    } | null;
  };
  timeline: Array<{ day: string; sent: number; alertable: number; rejected: number }>;
  scoreDistribution: Array<{ bucket: string; count: number }>;
  rejectionReasons: Array<{ reason: string; count: number }>;
  perModel: Array<{ model: string; count: number; sent: number; totalSavings: number; avgScore: number }>;
  perFamily: Array<{ family: string; count: number; sent: number }>;
  perGeneration: Array<{ generation: string; count: number }>;
  topSellers: Array<{ seller: string; count: number; sent: number; avgScore: number }>;
  sellerCountries: Array<{ country: string; count: number }>;
  listingAge: Array<{ bucket: string; count: number }>;
  searchEffectiveness: Array<{ source: string; runs: number; listings: number; alerts: number }>;
  scanHealth: { success: number; failed: number; skipped: number; running: number };
}

export function buildAnalytics(
  deals: Array<Record<string, unknown>>,
  scans: Array<Record<string, unknown>>,
  rangeDays: number
): AnalyticsSnapshot {
  const summary = computeSummary(deals);
  return {
    rangeDays,
    generatedAt: new Date().toISOString(),
    summary,
    timeline: computeTimeline(deals, rangeDays),
    scoreDistribution: computeScoreDistribution(deals),
    rejectionReasons: computeRejectionReasons(deals),
    perModel: computePerModel(deals),
    perFamily: computePerFamily(deals),
    perGeneration: computePerGeneration(deals),
    topSellers: computeTopSellers(deals),
    sellerCountries: computeCountryDistribution(deals),
    listingAge: computeListingAge(deals),
    searchEffectiveness: computeSearchEffectiveness(scans),
    scanHealth: computeScanHealth(scans)
  };
}

function computeSummary(deals: Array<Record<string, unknown>>): AnalyticsSnapshot["summary"] {
  const sent = deals.filter((d) => Number(d.sent) === 1);
  const moneySaved = sent.reduce((sum, d) => sum + Number(d.savings ?? 0), 0);
  const avgScore = sent.length ? sent.reduce((s, d) => s + Number(d.score ?? 0), 0) / sent.length : 0;
  const avgSavings = sent.length ? moneySaved / sent.length : 0;
  const avgDiscount = sent.length
    ? sent.reduce((s, d) => s + Number(d.discount_percent ?? 0), 0) / sent.length
    : 0;

  let bestDeal: AnalyticsSnapshot["summary"]["bestDeal"] = null;
  for (const d of sent) {
    const score = Number(d.score ?? 0);
    if (!bestDeal || score > bestDeal.score) {
      bestDeal = {
        model: String(d.model ?? "Modèle inconnu"),
        finalPrice: Number(d.final_price ?? 0),
        savings: Number(d.savings ?? 0),
        score,
        url: String(d.url ?? "")
      };
    }
  }

  return {
    moneySaved: Math.round(moneySaved),
    totalAlerts: sent.length,
    totalDeals: deals.length,
    avgScore: Math.round(avgScore),
    avgSavings: Math.round(avgSavings),
    avgDiscountPct: Math.round(avgDiscount * 1000) / 10, // 1 decimal
    bestDeal
  };
}

function computeTimeline(deals: Array<Record<string, unknown>>, rangeDays: number) {
  const buckets = new Map<string, { sent: number; alertable: number; rejected: number }>();
  // Seed every day in range so charts have a continuous x-axis.
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), { sent: 0, alertable: 0, rejected: 0 });
  }
  for (const deal of deals) {
    const created = String(deal.created_at ?? "");
    const day = created.slice(0, 10);
    const bucket = buckets.get(day);
    if (!bucket) continue;
    if (Number(deal.sent) === 1) bucket.sent += 1;
    if (Number(deal.should_alert) === 1) bucket.alertable += 1;
    else bucket.rejected += 1;
  }
  return [...buckets.entries()].map(([day, v]) => ({ day, ...v }));
}

function computeScoreDistribution(deals: Array<Record<string, unknown>>) {
  const order = ["0–49", "50–59", "60–69", "70–79", "80–89", "90–100"];
  const counts = new Map<string, number>(order.map((label) => [label, 0]));
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const deal of deals) {
    const score = Number(deal.score ?? 0);
    if (score < 50) bump("0–49");
    else if (score < 60) bump("50–59");
    else if (score < 70) bump("60–69");
    else if (score < 80) bump("70–79");
    else if (score < 90) bump("80–89");
    else bump("90–100");
  }
  return order.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
}

function computeRejectionReasons(deals: Array<Record<string, unknown>>) {
  const counts = new Map<string, number>();
  for (const deal of deals) {
    if (Number(deal.should_alert) === 1) continue;
    const raw = String(deal.rejection_reasons_json ?? "[]");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(parsed)) continue;
    for (const reason of parsed) {
      const text = normalizeReason(String(reason));
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));
}

function normalizeReason(reason: string): string {
  // Collapse parameterized variants like "score below 82.31" → "score below threshold"
  return reason
    .replace(/(?:above|below|under)\s+[\d.]+/i, (m) => m.split(/\s+/)[0] + " threshold")
    .replace(/€\s*[\d.]+/g, "€ threshold")
    .replace(/\d{2,4}h\b/g, "Nh")
    .slice(0, 80);
}

function computePerModel(deals: Array<Record<string, unknown>>) {
  const groups = new Map<string, { count: number; sent: number; totalSavings: number; scoreSum: number }>();
  for (const deal of deals) {
    const model = String(deal.model ?? "Inconnu");
    const g = groups.get(model) ?? { count: 0, sent: 0, totalSavings: 0, scoreSum: 0 };
    g.count += 1;
    if (Number(deal.sent) === 1) {
      g.sent += 1;
      g.totalSavings += Number(deal.savings ?? 0);
    }
    g.scoreSum += Number(deal.score ?? 0);
    groups.set(model, g);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].sent - a[1].sent)
    .slice(0, 8)
    .map(([model, g]) => ({
      model,
      count: g.count,
      sent: g.sent,
      totalSavings: Math.round(g.totalSavings),
      avgScore: g.count ? Math.round(g.scoreSum / g.count) : 0
    }));
}

function computePerFamily(deals: Array<Record<string, unknown>>) {
  const groups = new Map<string, { count: number; sent: number }>();
  for (const deal of deals) {
    const family = String(deal.family ?? "Autre");
    const g = groups.get(family) ?? { count: 0, sent: 0 };
    g.count += 1;
    if (Number(deal.sent) === 1) g.sent += 1;
    groups.set(family, g);
  }
  return [...groups.entries()].map(([family, g]) => ({ family, count: g.count, sent: g.sent }));
}

function computePerGeneration(deals: Array<Record<string, unknown>>) {
  const groups = new Map<string, number>();
  for (const deal of deals) {
    if (deal.generation == null) continue;
    const key = String(deal.generation);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([generation, count]) => ({ generation, count }));
}

function computeTopSellers(deals: Array<Record<string, unknown>>) {
  const groups = new Map<string, { count: number; sent: number; scoreSum: number }>();
  for (const deal of deals) {
    const seller = String(deal.seller_name ?? "");
    if (!seller) continue;
    const g = groups.get(seller) ?? { count: 0, sent: 0, scoreSum: 0 };
    g.count += 1;
    if (Number(deal.sent) === 1) g.sent += 1;
    g.scoreSum += Number(deal.score ?? 0);
    groups.set(seller, g);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([seller, g]) => ({
      seller,
      count: g.count,
      sent: g.sent,
      avgScore: g.count ? Math.round(g.scoreSum / g.count) : 0
    }));
}

function computeCountryDistribution(deals: Array<Record<string, unknown>>) {
  const groups = new Map<string, number>();
  for (const deal of deals) {
    const country = String(deal.seller_country ?? "").toUpperCase().trim();
    if (!country) continue;
    groups.set(country, (groups.get(country) ?? 0) + 1);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([country, count]) => ({ country, count }));
}

function computeListingAge(deals: Array<Record<string, unknown>>) {
  const order = ["< 1 h", "1–6 h", "6–24 h", "1–3 j", "3–7 j", "> 7 j"];
  const counts = new Map<string, number>(order.map((label) => [label, 0]));
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const deal of deals) {
    if (deal.hours_since_listed == null) continue;
    const h = Number(deal.hours_since_listed);
    if (!Number.isFinite(h)) continue;
    if (h < 1) bump("< 1 h");
    else if (h < 6) bump("1–6 h");
    else if (h < 24) bump("6–24 h");
    else if (h < 72) bump("1–3 j");
    else if (h < 168) bump("3–7 j");
    else bump("> 7 j");
  }
  return order.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
}

function computeSearchEffectiveness(scans: Array<Record<string, unknown>>) {
  const groups = new Map<string, { runs: number; listings: number; alerts: number }>();
  for (const scan of scans) {
    const source = String(scan.source ?? "scheduled");
    const g = groups.get(source) ?? { runs: 0, listings: 0, alerts: 0 };
    g.runs += 1;
    g.listings += Number(scan.listings ?? 0);
    g.alerts += Number(scan.sent ?? 0);
    groups.set(source, g);
  }
  return [...groups.entries()].map(([source, g]) => ({ source, ...g }));
}

function computeScanHealth(scans: Array<Record<string, unknown>>) {
  const out = { success: 0, failed: 0, skipped: 0, running: 0 };
  for (const scan of scans) {
    const status = String(scan.status ?? "");
    if (status === "success") out.success += 1;
    else if (status === "failed") out.failed += 1;
    else if (status === "skipped") out.skipped += 1;
    else if (status === "running") out.running += 1;
  }
  return out;
}
