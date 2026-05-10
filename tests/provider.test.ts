import test from "node:test";
import assert from "node:assert/strict";
import { ApifyVintedProvider, AuthorizedListingProvider, extractRawListings, normalizeListing, normalizeSellerRating, toApifyInput } from "../src/provider.js";
import type { RuntimeConfig } from "../src/types.js";

test("extracts items from common provider shapes", () => {
  assert.equal(extractRawListings([{ id: 1 }]).length, 1);
  assert.equal(extractRawListings({ items: [{ id: 1 }] }).length, 1);
  assert.equal(extractRawListings({ data: { results: [{ id: 1 }] } }).length, 1);
});

test("normalizes localized price and image fields", () => {
  const listing = normalizeListing({
    id: 123,
    title: "iPhone 15 Pro",
    price: { amount: "650,50", currency_code: "EUR" },
    url: "https://example.test/123",
    photos: [{ url: "https://example.test/photo.jpg" }],
    sellerRating: "4.8",
    sellerFeedbacks: "12"
  });

  assert.equal(listing?.id, "123");
  assert.equal(listing?.price, 650.5);
  assert.equal(listing?.imageUrl, "https://example.test/photo.jpg");
  assert.equal(listing?.sellerReviews, 12);
});

test("normalizes Apify Vinted actor output shape", () => {
  const listing = normalizeListing({
    id: 8567830076,
    title: "iPhone 15 Pro Max 256Go",
    price: { amount: "650.0", currency_code: "EUR" },
    total_item_price: { amount: "684.9", currency_code: "EUR" },
    path: "/items/8567830076-iphone-15-pro-max",
    brand_title: "Apple",
    status: "Very good",
    itemCountry: "France",
    user: {
      login: "seller1",
      profile_url: "https://www.vinted.fr/member/1",
      feedback_reputation: "4.9",
      feedback_count: "42",
      item_count: "12",
      created_at: "2024-01-10T12:00:00Z",
      country_code: "FR",
      city: "Paris"
    },
    favourite_count: 11,
    photos: [
      { url: "https://example.test/thumb.jpg", full_size_url: "https://example.test/full.jpg", is_main: true }
    ]
  });

  assert.equal(listing?.id, "8567830076");
  assert.equal(listing?.url, "https://www.vinted.fr/items/8567830076-iphone-15-pro-max");
  assert.equal(listing?.imageUrl, "https://example.test/full.jpg");
  assert.equal(listing?.sellerName, "seller1");
  assert.equal(listing?.sellerRating, 4.9);
  assert.equal(listing?.sellerReviews, 42);
  assert.equal(listing?.sellerProfileUrl, "https://www.vinted.fr/member/1");
  assert.equal(listing?.sellerItemCount, 12);
  assert.equal(listing?.sellerJoinedAt, "2024-01-10T12:00:00Z");
  assert.equal(listing?.sellerCountry, "FR");
  assert.equal(listing?.sellerLocation, "Paris");
  assert.equal(listing?.itemCountry, "FR");
  assert.equal(listing?.totalPrice, 684.9);
  assert.equal(listing?.favoriteCount, 11);
});

test("builds known total price from service and shipping fields", () => {
  const listing = normalizeListing({
    id: "total-1",
    title: "Samsung Galaxy S24 Ultra 256Go",
    price: { amount: "520", currency_code: "EUR" },
    service_fee: { amount: "27.2", currency_code: "EUR" },
    shipment_price: "5.99",
    url: "https://example.test/total-1"
  });

  assert.equal(listing?.price, 520);
  assert.equal(listing?.totalPrice, 553.19);
});

test("builds Apify actor input from a search config", () => {
  assert.deepEqual(toApifyInput({ market: "FR", query: "iphone 15 pro", limit: 50, sort: "newest" }), {
    maxProducts: 50,
    startUrls: [{ url: "https://www.vinted.fr/catalog?search_text=iphone+15+pro&order=newest_first" }]
  });
});

test("builds Apify actor input from a filtered Vinted URL", () => {
  assert.deepEqual(toApifyInput({
    market: "FR",
    query: "iphone 15 pro 256go",
    url: "https://www.vinted.fr/catalog?search_text=iphone%2015%20pro%20256go&order=newest_first",
    limit: 5,
    sort: "newest"
  }), {
    maxProducts: 10,
    startUrls: [{ url: "https://www.vinted.fr/catalog?search_text=iphone%2015%20pro%20256go&order=newest_first" }]
  });
});

test("normalizeSellerRating rescales 0-1 ratios, leaves 0-5 stars alone", () => {
  // 0-5 star inputs pass through.
  assert.equal(normalizeSellerRating(4.9), 4.9);
  assert.equal(normalizeSellerRating(5), 5);
  // 0 stays 0 (no feedback yet).
  assert.equal(normalizeSellerRating(0), 0);
  // 0-1 ratio is rescaled to a 0-5 star equivalent.
  assert.equal(normalizeSellerRating(0.95), 4.8);
  assert.equal(normalizeSellerRating(0.5), 2.5);
  // Garbage is dropped.
  assert.equal(normalizeSellerRating(undefined), undefined);
  assert.equal(normalizeSellerRating(-1), undefined);
  assert.equal(normalizeSellerRating(99), 5);
});

test("ApifyVintedProvider sends the token via Authorization header, not URL", async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl = "";
  let observedAuth: string | null = null;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    observedUrl = typeof url === "string" ? url : (url as URL).toString();
    const headers = init?.headers as Record<string, string> | undefined;
    observedAuth = headers?.authorization ?? headers?.Authorization ?? null;
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const provider = new ApifyVintedProvider(config({
      providerType: "apify",
      apifyToken: "test-token-do-not-leak"
    }));
    await provider.search({ market: "FR", query: "iphone 15 pro", limit: 1, sort: "newest" });
    assert.equal(observedUrl.includes("token=test-token-do-not-leak"), false);
    assert.equal(observedAuth, "Bearer test-token-do-not-leak");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("times out hung provider requests", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  }) as typeof fetch;

  try {
    const provider = new AuthorizedListingProvider(config({ providerTimeoutSeconds: 0.01 }));
    await assert.rejects(
      provider.search({ market: "FR", query: "iphone 15 pro", limit: 1, sort: "newest" }),
      /expiré/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("times out hung Apify requests", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  }) as typeof fetch;

  try {
    const provider = new ApifyVintedProvider(config({
      providerType: "apify",
      apifyToken: "test-token",
      providerTimeoutSeconds: 0.01
    }));
    await assert.rejects(
      provider.search({ market: "FR", query: "iphone 15 pro", limit: 1, sort: "newest" }),
      /expiré/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    providerType: "generic",
    authorizedDataApiUrl: "https://provider.example.test/search",
    authorizedDataApiKey: "test-key",
    apifyActorId: "epicscrapers~vinted-search-scraper",
    discordWebhookUrl: "https://discord.example.test/webhook",
    pollIntervalSeconds: 300,
    providerTimeoutSeconds: 20,
    maxProductsPerScan: 100,
    heartbeatEveryScans: 4,
    databasePath: ":memory:",
    runOnStart: false,
    dryRun: true,
    ...overrides
  };
}
