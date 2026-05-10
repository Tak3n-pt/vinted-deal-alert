import test from "node:test";
import assert from "node:assert/strict";
import { isInQuietHours, runScan } from "../src/index.js";
import type { AlertDeliveryOptions } from "../src/dashboardTypes.js";
import type { Listing, ScoredDeal } from "../src/types.js";

test("isInQuietHours handles plain windows", () => {
  const window: AlertDeliveryOptions = delivery({
    quietHoursEnabled: true,
    quietHoursStart: "09:00",
    quietHoursEnd: "17:00"
  });
  assert.equal(isInQuietHours(window, at("12:30")), true);
  assert.equal(isInQuietHours(window, at("08:59")), false);
  assert.equal(isInQuietHours(window, at("17:00")), false); // end is exclusive
});

test("isInQuietHours handles wrap-past-midnight windows", () => {
  const window: AlertDeliveryOptions = delivery({
    quietHoursEnabled: true,
    quietHoursStart: "23:00",
    quietHoursEnd: "08:00"
  });
  assert.equal(isInQuietHours(window, at("23:30")), true);
  assert.equal(isInQuietHours(window, at("02:00")), true);
  assert.equal(isInQuietHours(window, at("08:00")), false);
  assert.equal(isInQuietHours(window, at("12:00")), false);
});

test("isInQuietHours respects the enabled flag", () => {
  assert.equal(
    isInQuietHours(delivery({ quietHoursEnabled: false, quietHoursStart: "23:00", quietHoursEnd: "08:00" }), at("00:00")),
    false
  );
  assert.equal(isInQuietHours(undefined, at("00:00")), false);
});

test("runScan suppresses Discord during quiet hours but records the candidate", async () => {
  const harness = makeHarness();
  await runScan({
    provider: harness.provider,
    store: harness.store,
    discord: harness.discord,
    searches: [{ market: "FR", query: "iphone 15 pro max", limit: 5, sort: "newest" }],
    delivery: delivery({ quietHoursEnabled: true, quietHoursStart: "00:00", quietHoursEnd: "23:59" }),
    now: () => new Date("2026-05-10T12:00:00")
  });
  assert.equal(harness.discord.sent.length, 0);
  assert.equal(harness.store.reservedCount, 0); // no reservation when quiet
});

test("runScan caps alerts per scan", async () => {
  const harness = makeHarness({ listingCount: 5 });
  const result = await runScan({
    provider: harness.provider,
    store: harness.store,
    discord: harness.discord,
    searches: [{ market: "FR", query: "iphone 15 pro max", limit: 5, sort: "newest" }],
    delivery: delivery({ maxAlertsPerScan: 2 })
  });
  assert.equal(result.sent, 2);
  assert.equal(harness.discord.sent.length, 2);
});

test("runScan caps alerts per day across scans", async () => {
  const harness = makeHarness({ listingCount: 5 });
  harness.store.dailySent = 8;
  const result = await runScan({
    provider: harness.provider,
    store: harness.store,
    discord: harness.discord,
    searches: [{ market: "FR", query: "iphone 15 pro max", limit: 5, sort: "newest" }],
    delivery: delivery({ maxAlertsPerDay: 10 })
  });
  // Only 2 of the 5 alertable deals fit before the daily cap.
  assert.equal(result.sent, 2);
});

function delivery(overrides: Partial<AlertDeliveryOptions>): AlertDeliveryOptions {
  return {
    reAlertDropPercent: 0.10,
    maxAlertsPerScan: 0,
    maxAlertsPerDay: 0,
    quietHoursEnabled: false,
    quietHoursStart: "23:00",
    quietHoursEnd: "08:00",
    ...overrides
  };
}

function at(hhmm: string): Date {
  const [h = "0", m = "0"] = hhmm.split(":");
  const date = new Date(2026, 4, 10, Number(h), Number(m));
  return date;
}

interface RunScanHarness {
  provider: { search: () => Promise<Listing[]> };
  store: {
    recentHistory: () => Promise<never[]>;
    saveObserved: () => Promise<void>;
    reserveAlert: () => Promise<boolean>;
    recordAlert: () => Promise<void>;
    releaseAlert: () => Promise<void>;
    alertsInLast24h: () => Promise<number>;
    reservedCount: number;
    dailySent: number;
  };
  discord: { sendDeal: (deal: ScoredDeal) => Promise<void>; sent: ScoredDeal[] };
}

function makeHarness({ listingCount = 1 }: { listingCount?: number } = {}): RunScanHarness {
  const listings: Listing[] = Array.from({ length: listingCount }, (_, idx) => ({
    id: `listing-${idx}`,
    title: "iPhone 15 Pro Max 256Go",
    description: "Tres bon etat, facture, debloque tout operateur",
    price: 600 - idx * 5,
    currency: "EUR",
    url: `https://example.test/${idx}`,
    // Unique image per listing — shared images would trigger the
    // "duplicate-photo-in-current-scan" high-severity risk and reject all of
    // them before any cap test could exercise the limiter.
    imageUrl: `https://example.test/i-${idx}.jpg`,
    sellerName: `seller-${idx}`,
    sellerRating: 4.9,
    sellerReviews: 55,
    raw: {}
  }));
  const sent: ScoredDeal[] = [];
  const store = {
    reservedCount: 0,
    dailySent: 0,
    recentHistory: async () => [] as never[],
    saveObserved: async () => {},
    reserveAlert: async () => {
      store.reservedCount += 1;
      return true;
    },
    recordAlert: async () => {},
    releaseAlert: async () => {},
    alertsInLast24h: async () => store.dailySent
  };
  return {
    provider: { search: async () => listings },
    store,
    discord: {
      sent,
      sendDeal: async (deal: ScoredDeal) => {
        sent.push(deal);
      }
    }
  };
}
