// Side-by-side screenshot harness:
// (1) Mocks /api/* on localhost:5173 with believable fixture data so the
//     dashboard renders its full UI instead of the loading spinner.
// (2) Screenshots each of our views.
// (3) Screenshots the live MaterialPro demo for comparison.
// Output: dashboard/scripts/screenshots/*.png

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "screenshots");
const LOCAL = "http://127.0.0.1:5173";
const DEMO = "https://bootstrapdemos.wrappixel.com/materialpro/dist/horizontal/index3.html";
const VIEWPORT = { width: 1440, height: 900 };

// ── Fixture data (closely matches real shapes the backend returns) ──────────
const now = Date.now();
const iso = (offsetMs) => new Date(now - offsetMs).toISOString();

const FIXTURE = {
  authMe: {
    authenticated: true,
    user: { id: 1, username: "lakas", discordId: "123456", avatar: null, plan: "pro", email: "you@bonoitec.com" }
  },
  userSettings: {
    settings: { discordWebhookConfigured: true, dryRun: false }
  },
  status: {
    status: {
      paused: false,
      scanInFlight: false,
      lastScan: { listings: 187, status: "success", startedAt: iso(5 * 60_000) },
      nextScanAt: new Date(now + 14 * 60_000).toISOString(),
      bestCandidate: null
    }
  },
  settings: {
    settings: {
      providerType: "apify",
      apifyActorId: "vinted/vinted-scraper",
      authorizedDataApiUrl: "",
      pollIntervalSeconds: 900,
      providerTimeoutSeconds: 30,
      maxProductsPerScan: 200,
      heartbeatEveryScans: 24,
      minScore: 82,
      minDiscount: 0.2,
      minSavings: 80,
      reAlertDropPercent: 0.1,
      quietHoursEnabled: true,
      quietHoursStart: "23:00",
      quietHoursEnd: "08:00",
      maxAlertsPerScan: 0,
      maxAlertsPerDay: 0,
      runOnStart: false,
      dryRun: false,
      discordWebhookConfigured: true,
      apifyTokenConfigured: true,
      authorizedDataApiKeyConfigured: false
    }
  },
  searches: {
    searches: [
      { id: 1, query: "iphone 15 pro max 256go", url: "https://www.vinted.fr/catalog?search_text=iphone%2015%20pro%20max", limit: 50, enabled: true },
      { id: 2, query: "iphone 16 pro 256go", url: "https://www.vinted.fr/catalog?search_text=iphone%2016%20pro", limit: 40, enabled: true },
      { id: 3, query: "galaxy s24 ultra", url: "", limit: 30, enabled: true },
      { id: 4, query: "galaxy z fold 5", url: "", limit: 20, enabled: true },
      { id: 5, query: "pixel 8 pro 256", url: "", limit: 15, enabled: false }
    ]
  },
  modelRules: {
    modelRules: [
      { model: "iPhone 15 Pro Max", enabled: true, storagesGb: [256, 512], maxFinalPrice: 900, minScore: 85, minDiscount: 0.2, minSavings: 150 },
      { model: "iPhone 16 Pro", enabled: true, storagesGb: [128, 256], maxFinalPrice: 850, minScore: 82, minDiscount: 0.18, minSavings: 120 },
      { model: "Galaxy S24 Ultra", enabled: true, storagesGb: [256, 512], maxFinalPrice: 750, minScore: 80, minDiscount: 0.2, minSavings: 100 },
      { model: "Galaxy Z Fold 5", enabled: false, storagesGb: [256], maxFinalPrice: 900, minScore: 82, minDiscount: 0.25, minSavings: 200 }
    ]
  },
  riskRules: {
    riskRules: {
      rejectHighRisks: true,
      allowMissingImage: false,
      rejectNonOriginalScreen: true,
      rejectScreenReplaced: true,
      rejectMissingInvoice: false,
      minSellerReviews: 3,
      minSellerRating: 4.0,
      minBatteryHealth: 80,
      allowedCountries: ["FR", "BE", "ES"],
      customExcludeKeywords: ["reconditionne", "refurbished", "réservé", "echange"],
      customExcludeSeverity: "reject"
    }
  },
  deals: {
    deals: [
      { id: "d1", model: "iPhone 15 Pro Max", storageGb: 256, title: "iPhone 15 Pro Max 256Go Titane Naturel - état neuf", finalPrice: 780, benchmarkPrice: 980, discountPercent: 0.204, savings: 200, score: 92, riskLevel: "clean", sent: true, shouldAlert: true, url: "https://vinted.fr/items/1", rejectionReasons: [] },
      { id: "d2", model: "iPhone 16 Pro", storageGb: 256, title: "iPhone 16 Pro 256Go - bon état avec facture Apple", finalPrice: 720, benchmarkPrice: 920, discountPercent: 0.217, savings: 200, score: 89, riskLevel: "low", sent: true, shouldAlert: true, url: "https://vinted.fr/items/2", rejectionReasons: [] },
      { id: "d3", model: "Galaxy S24 Ultra", storageGb: 512, title: "Galaxy S24 Ultra 512Go, parfait état, factures", finalPrice: 580, benchmarkPrice: 750, discountPercent: 0.227, savings: 170, score: 87, riskLevel: "clean", sent: true, shouldAlert: true, url: "https://vinted.fr/items/3", rejectionReasons: [] },
      { id: "d4", model: "iPhone 15 Pro", storageGb: 128, title: "iPhone 15 Pro 128Go - écran d'origine, batterie 91%", finalPrice: 620, benchmarkPrice: 780, discountPercent: 0.205, savings: 160, score: 84, riskLevel: "low", sent: false, shouldAlert: true, url: "https://vinted.fr/items/4", rejectionReasons: [] },
      { id: "d5", model: "iPhone 14 Pro Max", storageGb: 256, title: "iPhone 14 Pro Max 256Go - écran réparé non original", finalPrice: 480, benchmarkPrice: 720, discountPercent: 0.333, savings: 240, score: 74, riskLevel: "high", sent: false, shouldAlert: false, url: "https://vinted.fr/items/5", rejectionReasons: ["blocked risk: screen replaced"] },
      { id: "d6", model: "Galaxy S23 Ultra", storageGb: 256, title: "S23 Ultra reconditionné, comme neuf", finalPrice: 420, benchmarkPrice: 540, discountPercent: 0.222, savings: 120, score: 70, riskLevel: "medium", sent: false, shouldAlert: false, url: "https://vinted.fr/items/6", rejectionReasons: ["score below 82"] },
      { id: "d7", model: "iPhone 13", storageGb: 128, title: "iPhone 13 128Go, occasion", finalPrice: 380, benchmarkPrice: 460, discountPercent: 0.174, savings: 80, score: 78, riskLevel: "low", sent: false, shouldAlert: false, url: "https://vinted.fr/items/7", rejectionReasons: ["discount below 20%"] },
      { id: "d8", model: "Pixel 8 Pro", storageGb: 256, title: "Pixel 8 Pro 256Go - état impeccable", finalPrice: 540, benchmarkPrice: 680, discountPercent: 0.206, savings: 140, score: 86, riskLevel: "clean", sent: true, shouldAlert: true, url: "https://vinted.fr/items/8", rejectionReasons: [] }
    ]
  },
  scans: {
    scans: [
      { id: 901, status: "success", source: "scheduled", listings: 187, alertable: 6, sent: 4, startedAt: iso(5 * 60_000), finishedAt: iso(4 * 60_000) },
      { id: 900, status: "success", source: "scheduled", listings: 142, alertable: 4, sent: 3, startedAt: iso(20 * 60_000), finishedAt: iso(19 * 60_000) },
      { id: 899, status: "success", source: "manual",    listings: 96,  alertable: 2, sent: 2, startedAt: iso(35 * 60_000), finishedAt: iso(34 * 60_000) },
      { id: 898, status: "failed",  source: "scheduled", listings: 0,   alertable: 0, sent: 0, startedAt: iso(50 * 60_000), finishedAt: iso(49 * 60_000) },
      { id: 897, status: "success", source: "scheduled", listings: 164, alertable: 5, sent: 4, startedAt: iso(65 * 60_000), finishedAt: iso(64 * 60_000) },
      { id: 896, status: "success", source: "scheduled", listings: 152, alertable: 3, sent: 3, startedAt: iso(80 * 60_000), finishedAt: iso(79 * 60_000) }
    ]
  },
  logs: {
    logs: [
      { id: 1, level: "info", message: "Scan success: 187 listings, 4 alerts sent",     createdAt: iso(5 * 60_000) },
      { id: 2, level: "info", message: "Search updated: iphone 16 pro 256go",            createdAt: iso(12 * 60_000) },
      { id: 3, level: "warn", message: "Plafond par scan atteint (5). Alertes différées",createdAt: iso(20 * 60_000) },
      { id: 4, level: "info", message: "Discord test message sent",                       createdAt: iso(45 * 60_000) },
      { id: 5, level: "error", message: "Scan failed: 0 listings, 0 alerts sent",        createdAt: iso(50 * 60_000) },
      { id: 6, level: "info", message: "Model rules updated",                             createdAt: iso(120 * 60_000) },
      { id: 7, level: "info", message: "Bot resumed from dashboard",                      createdAt: iso(180 * 60_000) },
      { id: 8, level: "info", message: "Risk rules updated",                              createdAt: iso(300 * 60_000) }
    ]
  }
};

const FIXTURE_ANALYTICS = {
  analytics: {
    rangeDays: 30,
    generatedAt: new Date().toISOString(),
    summary: {
      moneySaved: 4280,
      totalAlerts: 47,
      totalDeals: 318,
      avgScore: 86,
      avgSavings: 91,
      avgDiscountPct: 23.4,
      bestDeal: { model: "iPhone 16 Pro Max", finalPrice: 880, savings: 280, score: 96, url: "https://vinted.fr/best" }
    },
    timeline: Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (29 - i));
      const wave = Math.sin(i / 4) * 0.6 + Math.random() * 0.4;
      return {
        day: date.toISOString().slice(0, 10),
        sent: Math.max(0, Math.round(2 + wave * 3)),
        alertable: Math.max(0, Math.round(3 + wave * 4)),
        rejected: Math.max(0, Math.round(5 + wave * 8))
      };
    }),
    scoreDistribution: [
      { bucket: "0–49", count: 18 },
      { bucket: "50–59", count: 32 },
      { bucket: "60–69", count: 64 },
      { bucket: "70–79", count: 92 },
      { bucket: "80–89", count: 78 },
      { bucket: "90–100", count: 34 }
    ],
    rejectionReasons: [
      { reason: "score below threshold", count: 86 },
      { reason: "blocked risk: cracked-screen", count: 41 },
      { reason: "savings below threshold", count: 38 },
      { reason: "discount below threshold", count: 29 },
      { reason: "dashboard-min-seller-reviews", count: 24 },
      { reason: "dashboard-listing-too-old", count: 18 },
      { reason: "exceeds model max", count: 14 },
      { reason: "below logical market floor", count: 11 },
      { reason: "dashboard-seller-blocked", count: 8 },
      { reason: "battery below threshold", count: 6 }
    ],
    perModel: [
      { model: "iPhone 16 Pro Max", count: 64, sent: 12, totalSavings: 1820, avgScore: 87 },
      { model: "iPhone 15 Pro Max", count: 58, sent: 11, totalSavings: 1320, avgScore: 85 },
      { model: "Samsung Galaxy S24 Ultra", count: 41, sent: 8, totalSavings: 720, avgScore: 84 },
      { model: "iPhone 16 Pro", count: 38, sent: 7, totalSavings: 540, avgScore: 86 },
      { model: "iPhone 15 Pro", count: 32, sent: 5, totalSavings: 360, avgScore: 83 },
      { model: "Google Pixel 9 Pro", count: 22, sent: 3, totalSavings: 180, avgScore: 81 },
      { model: "Samsung Galaxy Z Fold 6", count: 14, sent: 1, totalSavings: 90, avgScore: 79 },
      { model: "iPhone 14 Pro Max", count: 12, sent: 0, totalSavings: 0, avgScore: 72 }
    ],
    perFamily: [
      { family: "iPhone", count: 204, sent: 35 },
      { family: "Galaxy", count: 76, sent: 9 },
      { family: "Pixel", count: 38, sent: 3 }
    ],
    perGeneration: [
      { generation: "13", count: 18 },
      { generation: "14", count: 42 },
      { generation: "15", count: 96 },
      { generation: "16", count: 110 }
    ],
    topSellers: [
      { seller: "phoneboutique_fr", count: 18, sent: 6, avgScore: 86 },
      { seller: "tech_resale", count: 14, sent: 4, avgScore: 84 },
      { seller: "marie_paris75", count: 11, sent: 3, avgScore: 89 },
      { seller: "iphoneshop_lyon", count: 9, sent: 3, avgScore: 82 },
      { seller: "lukas_82", count: 8, sent: 2, avgScore: 78 },
      { seller: "samsungstar", count: 7, sent: 2, avgScore: 81 },
      { seller: "deals_express", count: 6, sent: 1, avgScore: 75 }
    ],
    sellerCountries: [
      { country: "FR", count: 224 },
      { country: "BE", count: 38 },
      { country: "ES", count: 24 },
      { country: "IT", count: 18 },
      { country: "DE", count: 10 },
      { country: "NL", count: 4 }
    ],
    listingAge: [
      { bucket: "< 1 h", count: 24 },
      { bucket: "1–6 h", count: 68 },
      { bucket: "6–24 h", count: 110 },
      { bucket: "1–3 j", count: 78 },
      { bucket: "3–7 j", count: 28 },
      { bucket: "> 7 j", count: 10 }
    ],
    searchEffectiveness: [
      { source: "scheduled", runs: 142, listings: 8204, alerts: 41 },
      { source: "manual", runs: 7, listings: 540, alerts: 4 },
      { source: "startup", runs: 2, listings: 124, alerts: 2 }
    ],
    scanHealth: { success: 138, failed: 6, skipped: 3, running: 0 }
  }
};

const ROUTE_MAP = {
  "/api/auth/me": FIXTURE.authMe,
  "/api/status": FIXTURE.status,
  "/api/settings": FIXTURE.settings,
  "/api/user/settings": FIXTURE.userSettings,
  "/api/searches": FIXTURE.searches,
  "/api/model-rules": FIXTURE.modelRules,
  "/api/risk-rules": FIXTURE.riskRules,
  "/api/deals": FIXTURE.deals,
  "/api/scans": FIXTURE.scans,
  "/api/logs": FIXTURE.logs,
  "/api/analytics": FIXTURE_ANALYTICS
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  // Intercept API calls — match by pathname prefix to allow query strings.
  await context.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    for (const [path, payload] of Object.entries(ROUTE_MAP)) {
      if (url.pathname === path) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
      }
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  const page = await context.newPage();
  const VIEW_ORDER = ["dashboard", "analytics", "deals", "searches", "rules", "risks", "settings"];

  for (const view of VIEW_ORDER) {
    await page.goto(`${LOCAL}/#${view}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate((v) => {
      const map = { dashboard: 0, analytics: 1, deals: 2, searches: 3, rules: 4, risks: 5, settings: 6 };
      const idx = map[v];
      const links = document.querySelectorAll(".sidebar-link");
      if (links[idx]) links[idx].click();
    }, view);
    await page.waitForTimeout(2200);
    const out = `${OUT}/local-${view}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log("✓", out);
  }

  // Demo screenshot
  const demoPage = await context.newPage();
  await demoPage.goto(DEMO, { waitUntil: "networkidle" }).catch(() => {});
  await demoPage.waitForTimeout(2500);
  const demoOut = `${OUT}/demo-index3.png`;
  await demoPage.screenshot({ path: demoOut, fullPage: true });
  console.log("✓", demoOut);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
