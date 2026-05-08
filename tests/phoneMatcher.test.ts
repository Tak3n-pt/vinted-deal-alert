import test from "node:test";
import assert from "node:assert/strict";
import { matchPhone } from "../src/phoneMatcher.js";
import type { Listing } from "../src/types.js";

test("matches recent iPhone Pro models", () => {
  const match = matchPhone(listing("iPhone 15 Pro Max 256Go", "Excellent etat"));
  assert.equal(match?.model, "iPhone 15 Pro Max");
  assert.equal(match?.storageGb, 256);
});

test("rejects non-pro iPhone models", () => {
  assert.equal(matchPhone(listing("iPhone 15 128Go", "comme neuf")), null);
});

test("matches Samsung Ultra and Fold models", () => {
  assert.equal(matchPhone(listing("Samsung Galaxy S24 Ultra 256GB", "") )?.model, "Samsung Galaxy S24 Ultra");
  assert.equal(matchPhone(listing("Galaxy Z Fold 5 512 Go", "") )?.model, "Samsung Galaxy Z Fold 5");
});

function listing(title: string, description: string): Listing {
  return {
    id: title,
    title,
    description,
    price: 1,
    currency: "EUR",
    url: "https://example.test",
    raw: {}
  };
}
