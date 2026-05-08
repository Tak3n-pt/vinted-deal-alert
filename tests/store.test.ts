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
