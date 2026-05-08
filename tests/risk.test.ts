import test from "node:test";
import assert from "node:assert/strict";
import { findRiskSignals } from "../src/risk.js";
import type { Listing } from "../src/types.js";

test("rejects locked and parts-only listings", () => {
  const risks = findRiskSignals(listing("iPhone 14 Pro", "iCloud bloque pour pieces"));
  assert.equal(risks.some((risk) => risk.severity === "reject" && risk.label === "iCloud locked"), true);
  assert.equal(risks.some((risk) => risk.severity === "reject" && risk.label === "parts only"), true);
});

test("flags balanced cosmetic risks without rejecting", () => {
  const risks = findRiskSignals(listing("Samsung S24 Ultra", "micro rayures, sans facture"));
  assert.equal(risks.some((risk) => risk.severity === "reject"), false);
  assert.equal(risks.some((risk) => risk.label === "scratches"), true);
});

test("does not reject a real phone listing that includes accessories", () => {
  const risks = findRiskSignals(listing("iPhone 15 Pro Max 256Go", "Vendu avec chargeur et cable, tres bon etat"));
  assert.equal(risks.some((risk) => risk.label === "accessory only"), false);
});

test("still rejects accessory-only listings", () => {
  const risks = findRiskSignals(listing("Coque pour iPhone 15 Pro Max", "Protection silicone neuve"));
  assert.equal(risks.some((risk) => risk.label === "accessory only" && risk.severity === "reject"), true);
});

test("rejects non-French accessory terms from live Vinted search", () => {
  for (const title of [
    "funda iphone 15 pro max",
    "hoesje iphone 15 pro max",
    "iphone 15 pro burga",
    "hulle samsung galaxy s24 ultra",
    "screen protector iphone 15 pro",
    "display originale schermo iphone 16 pro max"
  ]) {
    const risks = findRiskSignals(listing(title, "new"));
    assert.equal(
      risks.some((risk) => risk.label === "accessory only" && risk.severity === "reject"),
      true,
      title
    );
  }
});

test("rejects bundle listings with other devices", () => {
  const risks = findRiskSignals(listing("iPhone 16 Pro Max 256GB + Apple Watch", "excellent etat"));
  assert.equal(risks.some((risk) => risk.label === "bundle or different device" && risk.severity === "reject"), true);
});

test("rejects unrealistic S-tier phone prices", () => {
  const risks = findRiskSignals({ ...listing("iPhone 15 Pro Max 256Go", "excellent etat"), price: 25 });
  assert.equal(risks.some((risk) => risk.label === "unrealistic phone price" && risk.severity === "reject"), true);
});

test("flags low battery health and replaced screen details", () => {
  const risks = findRiskSignals(listing("iPhone 15 Pro Max 256Go", "Batterie 79%, ecran change"));
  assert.equal(risks.some((risk) => risk.label === "battery health below 80%" && risk.severity === "high"), true);
  assert.equal(risks.some((risk) => risk.label === "screen replaced" && risk.severity === "medium"), true);
});

test("flags non-original screens as high risk", () => {
  const risks = findRiskSignals(listing("Samsung Galaxy S24 Ultra 256Go", "Ecran non original, fonctionne"));
  assert.equal(risks.some((risk) => risk.label === "non-original screen" && risk.severity === "high"), true);
});

function listing(title: string, description: string): Listing {
  return {
    id: title,
    title,
    description,
    price: 500,
    currency: "EUR",
    url: "https://example.test",
    raw: {}
  };
}
