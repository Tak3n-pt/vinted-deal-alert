import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DealStore } from "../src/store.js";
import type { ScoredDeal } from "../src/types.js";

test("stores observed listings and prevents duplicate alerts until a 10% drop", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "vinted-deals-")), "deals.sqlite");
  const store = await DealStore.open(path);
  const deal = scoredDeal(650);

  await store.saveObserved(deal.listing, deal.match);
  assert.equal((await store.recentHistory()).length, 1);
  assert.equal(await store.shouldSendAlert(deal), true);
  assert.equal(await store.reserveAlert(deal), true);
  assert.equal(await store.reserveAlert(deal), false);
  await store.releaseAlert(deal);
  assert.equal(await store.reserveAlert(deal), true);

  await store.recordAlert(deal);
  assert.equal(await store.shouldSendAlert(scoredDeal(620)), false);
  assert.equal(await store.shouldSendAlert(scoredDeal(585)), true);
  assert.equal(await store.reserveAlert(scoredDeal(620)), false);
  assert.equal(await store.reserveAlert(scoredDeal(585)), true);

  const totalPriceDeal = scoredDeal(650, 700);
  await store.recordAlert(totalPriceDeal);
  assert.equal(await store.shouldSendAlert(scoredDeal(610, 640)), false);
  assert.equal(await store.shouldSendAlert(scoredDeal(610, 620)), true);
});

test("re-alert threshold is configurable per call", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "vinted-realert-")), "deals.sqlite");
  const store = await DealStore.open(path);
  await store.recordAlert(scoredDeal(1000));
  // 5% drop threshold: 950 must be enough to re-alert.
  assert.equal(await store.shouldSendAlert(scoredDeal(950), 0.05), true);
  // Default 10% drop: 950 NOT enough.
  assert.equal(await store.shouldSendAlert(scoredDeal(950)), false);
  // 20% drop: 950 not enough, 800 is.
  assert.equal(await store.shouldSendAlert(scoredDeal(950), 0.20), false);
  assert.equal(await store.shouldSendAlert(scoredDeal(800), 0.20), true);
  // Reserve respects the same parameter.
  assert.equal(await store.reserveAlert(scoredDeal(950), 0.05), true);
});

test("alertsInLast24h counts only sent alerts in the last 24 hours", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "vinted-daily-")), "deals.sqlite");
  const store = await DealStore.open(path);
  assert.equal(await store.alertsInLast24h(), 0);
  await store.recordAlert(scoredDeal(800));
  assert.equal(await store.alertsInLast24h(), 1);
  // A reservation that hasn't been promoted to 'sent' shouldn't count.
  const other = scoredDeal(700);
  other.listing.id = "listing-2";
  await store.reserveAlert(other);
  assert.equal(await store.alertsInLast24h(), 1);
  await store.recordAlert(other);
  assert.equal(await store.alertsInLast24h(), 2);
});

test("alert state is scoped per user — two users both alert on the same listing", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "vinted-multi-tenant-")), "deals.sqlite");
  const store = await DealStore.open(path);
  const deal = scoredDeal(650);

  // User 1 reserves and sends — that listing is now "alerted" for user 1
  assert.equal(await store.reserveAlert(deal, undefined, 1), true);
  await store.recordAlert(deal, 1);
  // User 1 attempting again on the same listing without a price drop is blocked
  assert.equal(await store.reserveAlert(deal, undefined, 1), false);

  // User 2 attempting the same listing must NOT be blocked by user 1's alert
  assert.equal(await store.reserveAlert(deal, undefined, 2), true);
  await store.recordAlert(deal, 2);

  // Daily counts are independent per user
  assert.equal(await store.alertsInLast24h(1), 1);
  assert.equal(await store.alertsInLast24h(2), 1);

  // User 1's re-alert threshold (10% drop) still applies to user 1 alone
  assert.equal(await store.shouldSendAlert(scoredDeal(620), undefined, 1), false);
  assert.equal(await store.shouldSendAlert(scoredDeal(585), undefined, 1), true);
  // User 2's threshold tracks user 2's own price, not user 1's
  assert.equal(await store.shouldSendAlert(scoredDeal(620), undefined, 2), false);
});

test("stores final observed costs and ignores unrealistic low prices in benchmark history", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "vinted-deals-")), "deals.sqlite");
  const store = await DealStore.open(path);
  const lowPrice = scoredDeal(3);
  const normalPrice = scoredDeal(650);
  normalPrice.listing.totalPrice = 690;

  await store.saveObserved(lowPrice.listing, lowPrice.match);
  await store.saveObserved({ ...normalPrice.listing, id: "listing-2" }, normalPrice.match);

  const history = await store.recentHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0]?.price, 690);
});

function scoredDeal(price: number, finalPrice = price): ScoredDeal {
  return {
    listing: {
      id: "listing-1",
      title: "iPhone 15 Pro Max 256Go",
      description: "Tres bon etat",
      price,
      currency: "EUR",
      url: "https://example.test",
      raw: {}
    },
    match: {
      brand: "apple",
      family: "iPhone",
      model: "iPhone 15 Pro Max",
      generation: 15,
      tier: "pro-max",
      storageGb: 256,
      confidence: 0.98
    },
    benchmarkPrice: 890,
    finalPrice,
    discountPercent: 0.27,
    savings: 240,
    score: 91,
    risks: [],
    reasons: [],
    rejectionReasons: [],
    shouldAlert: true
  };
}
