import test from "node:test";
import assert from "node:assert/strict";
import { findRiskSignals } from "../src/risk.js";
import type { Listing } from "../src/types.js";

test("rejects locked and parts-only listings", () => {
  const risks = findRiskSignals(listing("iPhone 14 Pro", "iCloud bloque pour pieces"));
  assert.equal(risks.some((risk) => risk.severity === "reject" && risk.label === "iCloud bloqué"), true);
  assert.equal(risks.some((risk) => risk.severity === "reject" && risk.label === "vendu pour pièces"), true);
});

test("flags balanced cosmetic risks without rejecting", () => {
  const risks = findRiskSignals(listing("Samsung S24 Ultra", "micro rayures, sans facture"));
  assert.equal(risks.some((risk) => risk.severity === "reject"), false);
  assert.equal(risks.some((risk) => risk.label === "rayures"), true);
});

test("does not reject a real phone listing that includes accessories", () => {
  const risks = findRiskSignals(listing("iPhone 15 Pro Max 256Go", "Vendu avec chargeur et cable, tres bon etat"));
  assert.equal(risks.some((risk) => risk.label === "accessoire uniquement"), false);
});

test("does not reject a real phone listing that mentions a case in the title", () => {
  const risks = findRiskSignals(listing("iPhone 15 Pro Max 256Go avec coque", "Tres bon etat, facture"));
  assert.equal(risks.some((risk) => risk.label === "accessoire uniquement"), false);
});

test("still rejects accessory-only listings", () => {
  const risks = findRiskSignals(listing("Coque pour iPhone 15 Pro Max", "Protection silicone neuve"));
  assert.equal(risks.some((risk) => risk.label === "accessoire uniquement" && risk.severity === "reject"), true);
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
      risks.some((risk) => risk.label === "accessoire uniquement" && risk.severity === "reject"),
      true,
      title
    );
  }
});

test("rejects bundle listings with other devices", () => {
  const risks = findRiskSignals(listing("iPhone 16 Pro Max 256GB + Apple Watch", "excellent etat"));
  assert.equal(risks.some((risk) => risk.label === "lot ou appareil différent" && risk.severity === "reject"), true);
});

test("rejects unrealistic S-tier phone prices", () => {
  const risks = findRiskSignals({ ...listing("iPhone 15 Pro Max 256Go", "excellent etat"), price: 25 });
  assert.equal(risks.some((risk) => risk.label === "prix téléphone irréaliste" && risk.severity === "reject"), true);
});

test("flags low battery health and replaced screen details", () => {
  const risks = findRiskSignals(listing("iPhone 15 Pro Max 256Go", "Batterie 79%, ecran change"));
  assert.equal(risks.some((risk) => risk.label === "batterie sous 80%" && risk.severity === "high"), true);
  assert.equal(risks.some((risk) => risk.label === "écran remplacé" && risk.severity === "medium"), true);
});

test("rejects explicit off-platform payment scam phrasing", () => {
  for (const text of [
    "iPhone 15 Pro Max paiement PayPal amis",
    "iPhone 15 Pro Max envoi direct hors Vinted",
    "iPhone 15 Pro Max paiement paypal f&f"
  ]) {
    const risks = findRiskSignals(listing("iPhone 15 Pro Max", text));
    assert.equal(risks.some((risk) => risk.code === "off-platform-payment" && risk.severity === "reject"), true, text);
  }
});

test("flags off-platform contact requests as high but not reject", () => {
  // "Contactez-moi sur WhatsApp" is suspicious but not always a scam — flag
  // high so the operator can still allow such listings via risk rules.
  const risks = findRiskSignals(listing("iPhone 15 Pro Max", "Contactez-moi sur WhatsApp pour répondre rapidement"));
  assert.equal(risks.some((risk) => risk.code === "contact-off-platform" && risk.severity === "high"), true);
  assert.equal(risks.some((risk) => risk.code === "off-platform-payment"), false);
});

test("does not reject benign mentions of WhatsApp or Telegram", () => {
  for (const text of [
    "iPhone 15 Pro Max bon état, je ne réponds pas sur WhatsApp",
    "iPhone 15 Pro Max désolé pas de Telegram"
  ]) {
    const risks = findRiskSignals(listing("iPhone 15 Pro Max", text));
    assert.equal(risks.some((risk) => risk.severity === "reject" && risk.code === "off-platform-payment"), false, text);
  }
});

test("rejects replacement-part listings that include a phone model name", () => {
  for (const title of [
    "vitre arriere pour iphone 15 pro max",
    "batterie de remplacement pour iphone 14 pro",
    "nappe pour samsung galaxy s24 ultra"
  ]) {
    const risks = findRiskSignals(listing(title, "neuf"));
    assert.equal(
      risks.some((risk) => risk.code === "accessory-only" && risk.severity === "reject"),
      true,
      title
    );
  }
});

test("rejects already-sold or reserved listings", () => {
  const risks = findRiskSignals(listing("iPhone 15 Pro Max 256Go", "Annonce reservee, en attente paiement"));
  assert.equal(risks.some((risk) => risk.code === "already-sold" && risk.severity === "reject"), true);
});

test("rejects activation lock and stolen-device wording", () => {
  for (const description of [
    "Remote management MDM actif",
    "Activation lock impossible a enlever",
    "Telephone perdu retrouve, compte Apple bloque"
  ]) {
    const risks = findRiskSignals(listing("iPhone 15 Pro Max 256Go", description));
    assert.equal(
      risks.some((risk) => risk.code === "activation-or-ownership-lock" && risk.severity === "reject"),
      true,
      description
    );
  }
});

test("flags non-original screens as high risk", () => {
  const risks = findRiskSignals(listing("Samsung Galaxy S24 Ultra 256Go", "Ecran non original, fonctionne"));
  assert.equal(risks.some((risk) => risk.label === "écran non original" && risk.severity === "high"), true);
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
