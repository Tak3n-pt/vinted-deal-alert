import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscordPayload } from "../src/discord.js";
import type { ScoredDeal } from "../src/types.js";

test("builds a Discord webhook embed", () => {
  const payload = buildDiscordPayload({
    listing: {
      id: "1",
      title: "iPhone 15 Pro Max 256Go",
      description: "",
      price: 650,
      currency: "EUR",
      url: "https://example.test",
      raw: {},
      sellerName: "seller",
      sellerRating: 4.9,
      sellerReviews: 20
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
    finalPrice: 690,
    discountPercent: 0.27,
    savings: 240,
    score: 91,
    risks: [],
    reasons: ["27% sous la référence"],
    rejectionReasons: [],
    shouldAlert: true
  } satisfies ScoredDeal);

  const embeds = payload.embeds as Array<Record<string, unknown>>;
  assert.equal(embeds.length, 1);
  assert.match(String(embeds[0]?.title), /iPhone 15 Pro Max/);
  const fields = embeds[0]?.fields as Array<Record<string, string>>;
  assert.equal(fields.some((field) => field.name === "Prix final utilisé" && field.value === "690 EUR"), true);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});
