import test from "node:test";
import assert from "node:assert/strict";
import { resolveBenchmark, scoreListing, scoreListings } from "../src/scoring.js";
import { benchmarkKey } from "../src/phoneMatcher.js";
import type { Listing, PhoneMatch } from "../src/types.js";

test("alerts on strong clean iPhone deal", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 650,
    description: "Tres bon etat, facture, debloque tout operateur",
    sellerRating: 4.9,
    sellerReviews: 55,
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.shouldAlert, true);
  assert.ok((deal?.score ?? 0) >= 82);
});

test("scores common storage variants from fallback benchmark", () => {
  const variants = [
    ["iPhone 15 Pro 256Go", 500],
    ["iPhone 15 Pro 512Go", 580],
    ["Samsung Galaxy S23 Ultra 512Go", 430],
    ["Google Pixel 10 Pro XL 256Go", 610],
    ["Samsung Galaxy S26 Ultra 256Go", 760]
  ] as const;

  for (const [title, price] of variants) {
    const deal = scoreListing(listing({
      title,
      price,
      description: "Tres bon etat, facture, debloque tout operateur",
      sellerRating: 4.9,
      sellerReviews: 55,
      imageUrl: "https://example.test/image.jpg"
    }), []);

    assert.notEqual(deal, null, title);
    assert.equal(deal?.shouldAlert, true, title);
    assert.ok((deal?.benchmarkPrice ?? 0) > price, title);
  }
});

test("does not alert on rejected risk even if cheap", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 350,
    description: "iCloud bloque pour pieces",
    sellerRating: 4.9,
    sellerReviews: 55,
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.shouldAlert, false);
});

test("uses final cost instead of raw listing price", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 650,
    totalPrice: 820,
    description: "Tres bon etat, facture, debloque tout operateur",
    sellerRating: 4.9,
    sellerReviews: 55,
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.finalPrice, 820);
  assert.equal(deal?.shouldAlert, false);
});

test("does not alert when seller history is too weak for a large discount", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 560,
    description: "Tres bon etat, facture, debloque tout operateur",
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.shouldAlert, false);
  assert.equal(deal?.risks.some((risk) => risk.label === "vendeur sans avis" && risk.severity === "high"), true);
});

test("does not alert when a deep discount comes from a very new seller account", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 600,
    description: "Tres bon etat, facture, debloque tout operateur",
    sellerRating: 5,
    sellerReviews: 10,
    sellerJoinedAt: daysAgo(10),
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.shouldAlert, false);
  assert.equal(deal?.risks.some((risk) => risk.label === "compte vendeur très récent" && risk.severity === "high"), true);
});

test("does not alert on deep discount with seller and item country mismatch", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 520,
    description: "Tres bon etat, facture, debloque tout operateur",
    sellerRating: 4.9,
    sellerReviews: 55,
    sellerCountry: "DE",
    itemCountry: "FR",
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.shouldAlert, false);
  assert.equal(deal?.risks.some((risk) => risk.label === "pays vendeur différent du pays de l'article" && risk.severity === "high"), true);
});

test("uses related clean history when exact condition history is thin", () => {
  const match: PhoneMatch = {
    brand: "apple",
    family: "iPhone",
    model: "iPhone 15 Pro Max",
    generation: 15,
    tier: "pro-max",
    storageGb: 256,
    confidence: 0.98
  };
  const exactKey = benchmarkKey(match, "very-good");
  const relatedKey = benchmarkKey(match, "good");
  const benchmark = resolveBenchmark(match, exactKey, Array.from({ length: 10 }, (_, index) => ({
    benchmarkKey: relatedKey,
    price: 700 + index
  })));

  assert.ok(benchmark < 890);
  assert.ok(benchmark > 700);
});

test("adds scan-level duplicate photo risk before alerting", () => {
  const deals = scoreListings([
    listing({
      id: "duplicate-1",
      title: "iPhone 15 Pro Max 256Go",
      price: 600,
      description: "Tres bon etat, facture, debloque tout operateur",
      sellerName: "seller-a",
      sellerRating: 4.9,
      sellerReviews: 55,
      imageUrl: "https://example.test/same.jpg"
    }),
    listing({
      id: "duplicate-2",
      title: "iPhone 15 Pro Max 256Go",
      price: 600,
      description: "Tres bon etat, facture, debloque tout operateur",
      sellerName: "seller-b",
      sellerRating: 4.9,
      sellerReviews: 55,
      imageUrl: "https://example.test/same.jpg"
    })
  ], []);

  assert.equal(deals.length, 2);
  assert.equal(deals.every((deal) => !deal.shouldAlert), true);
  assert.equal(deals.every((deal) => deal.risks.some((risk) => risk.label === "photo dupliquée dans le scan" && risk.severity === "high")), true);
});

test("does not alert on high-severity condition risks even with a strong discount", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 580,
    description: "Ecran casse mais fonctionne, debloque tout operateur",
    sellerRating: 4.9,
    sellerReviews: 55,
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.shouldAlert, false);
  assert.equal(deal?.risks.some((risk) => risk.label === "écran cassé" && risk.severity === "high"), true);
});

test("does not alert on absolute savings alone when score and discount are weak", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 760,
    description: "Tres bon etat",
    sellerRating: 0,
    sellerReviews: 0,
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(Math.round(deal?.savings ?? 0), 88);
  assert.equal(deal?.shouldAlert, false);
});

test("does not alert on accessory listings that mention target phone model", () => {
  for (const title of ["funda iphone 15 pro max", "hoesje iphone 15 pro max", "iphone 15 pro burga"]) {
    const deal = scoreListing(listing({
      title,
      price: 3,
      description: "new",
      sellerRating: 4.9,
      sellerReviews: 55,
      imageUrl: "https://example.test/image.jpg"
    }), []);

    assert.equal(deal?.shouldAlert, false, title);
    assert.equal(deal?.risks.some((risk) => risk.label === "accessoire uniquement"), true, title);
  }
});

test("does not alert on unrealistic low phone prices", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 25,
    description: "excellent etat",
    sellerRating: 4.9,
    sellerReviews: 55,
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.shouldAlert, false);
  assert.equal(deal?.risks.some((risk) => risk.label === "prix téléphone irréaliste"), true);
});

test("does not alert below model-specific logical market floor", () => {
  const deal = scoreListing(listing({
    title: "iPhone 16 Pro Max 256GB",
    price: 465,
    description: "excellent etat",
    sellerRating: 4.9,
    sellerReviews: 55,
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.shouldAlert, false);
  assert.equal(deal?.risks.some((risk) => risk.label.startsWith("prix inférieur au plancher logique")), true);
});

test("does not alert display or bundle results from live searches", () => {
  for (const title of [
    "display originale schermo iphone 16 pro max",
    "iphone 16 pro max 256gb apple watch se 2nd generation"
  ]) {
    const deal = scoreListing(listing({
      title,
      price: 500,
      description: "excellent etat",
      sellerRating: 4.9,
      sellerReviews: 55,
      imageUrl: "https://example.test/image.jpg"
    }), []);

    assert.equal(deal?.shouldAlert, false, title);
  }
});

test("allows balanced cosmetic issue only when discount is strong", () => {
  const deal = scoreListing(listing({
    title: "Samsung Galaxy S24 Ultra 256Go",
    price: 480,
    description: "Bon etat, micro rayures, fonctionne parfaitement",
    sellerRating: 4.8,
    sellerReviews: 22,
    imageUrl: "https://example.test/image.jpg"
  }), []);

  assert.equal(deal?.shouldAlert, true);
});

test("dashboard model rule blocks disabled models", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 650,
    description: "Tres bon etat, facture, debloque tout operateur",
    sellerRating: 4.9,
    sellerReviews: 55,
    imageUrl: "https://example.test/image.jpg"
  }), [], [], {
    modelRules: [{
      model: "iPhone 15 Pro Max",
      enabled: false,
      storagesGb: [256]
    }]
  });

  assert.equal(deal?.shouldAlert, false);
  assert.equal(deal?.rejectionReasons.some((reason) => reason.includes("désactivé")), true);
});

test("dashboard max final price blocks expensive alerts", () => {
  const deal = scoreListing(listing({
    title: "iPhone 15 Pro Max 256Go",
    price: 650,
    description: "Tres bon etat, facture, debloque tout operateur",
    sellerRating: 4.9,
    sellerReviews: 55,
    imageUrl: "https://example.test/image.jpg"
  }), [], [], {
    modelRules: [{
      model: "iPhone 15 Pro Max",
      enabled: true,
      storagesGb: [256],
      maxFinalPrice: 600
    }]
  });

  assert.equal(deal?.shouldAlert, false);
  assert.equal(deal?.rejectionReasons.some((reason) => reason.includes("supérieur au maximum dashboard")), true);
});

function listing(input: Partial<Listing>): Listing {
  const item: Listing = {
    id: input.id ?? input.title ?? "id",
    title: input.title ?? "",
    description: input.description ?? "",
    price: input.price ?? 1,
    currency: "EUR",
    url: "https://example.test",
    raw: {}
  };
  if (input.sellerRating !== undefined) item.sellerRating = input.sellerRating;
  if (input.sellerReviews !== undefined) item.sellerReviews = input.sellerReviews;
  if (input.sellerName !== undefined) item.sellerName = input.sellerName;
  if (input.totalPrice !== undefined) item.totalPrice = input.totalPrice;
  if (input.sellerItemCount !== undefined) item.sellerItemCount = input.sellerItemCount;
  if (input.sellerJoinedAt !== undefined) item.sellerJoinedAt = input.sellerJoinedAt;
  if (input.sellerCountry !== undefined) item.sellerCountry = input.sellerCountry;
  if (input.itemCountry !== undefined) item.itemCountry = input.itemCountry;
  if (input.imageUrl !== undefined) item.imageUrl = input.imageUrl;
  if (input.condition !== undefined) item.condition = input.condition;
  return item;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString();
}
