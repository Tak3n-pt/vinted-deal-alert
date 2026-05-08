import type { Listing, RiskSignal } from "./types.js";

const REJECT_PATTERNS: Array<[RegExp, string, string]> = [
  [/\b(?:icloud|i cloud)\s*(?:bloqu|lock|blocked|verrouill)/i, "icloud-locked", "iCloud bloqué"],
  [/\b(?:simlock|sim\s*lock|bloqu[eé]\s*op[eé]rateur|operator locked)\b/i, "operator-locked", "bloqué opérateur"],
  [/\b(?:blacklist|blacklisted|imei\s*(?:bloqu|blacklist|hs))\b/i, "blacklisted-imei", "IMEI blacklisté"],
  [/\b(?:pour\s*pi[eè]ces|for\s*parts|pi[eè]ces\s*d[eé]tach[eé]es)\b/i, "parts-only", "vendu pour pièces"],
  [/\b(?:ne\s*s['’]?allume\s*pas|does\s*not\s*turn\s*on|dead|hs)\b/i, "does-not-turn-on", "ne s'allume pas"],
  [/\b(?:r[eé]plique|replica|fake|clone|dummy|factice)\b/i, "replica-or-dummy", "réplique ou factice"],
  [/\b(?:apple\s*watch|airpods|ipad)\b/i, "bundle-or-different-device", "lot ou appareil différent"]
];

const ACCESSORY_ONLY_PATTERNS: RegExp[] = [
  /\b(?:coque|case|cover|housse|etui|[eé]tui|funda|hoesje|h[uü]lle|capa|custodia|bumper|burga)\b/i,
  /\b(?:display|schermo|lcd|screen|[eé]cran)\s+(?:original|originale|for|pour|iphone|samsung|galaxy)\b/i,
  /\b(?:chargeur|charger|cable|c[âa]ble|adapter|adaptateur|accessoire|protection|protector|screen\s*protector|verre\s*tremp[eé]|film\s*(?:protecteur|protection))\b/i,
  /\b(?:lot\s+de\s+)?(?:coques|cases|covers|housses|etuis|[eé]tuis|fundas|hoesjes|h[uü]llen|chargeurs|chargers|cables|accessoires|protections)\b/i
];

const HIGH_PATTERNS: Array<[RegExp, string, string]> = [
  [/\b(?:face\s*id\s*(?:hs|ne marche pas|ko)|faceid\s*(?:hs|ko))\b/i, "face-id-issue", "problème Face ID"],
  [/\b(?:ecran|[eé]cran|screen)\s*(?:cass[eé]|cracked|fissur[eé])/i, "cracked-screen", "écran cassé"],
  [/\b(?:dos|back|vitre\s*arri[eè]re)\s*(?:cass[eé]|cracked|fissur[eé])/i, "cracked-back", "dos cassé"],
  [/\b(?:batterie|battery)\s*(?:hs|faible|weak|a\s*changer|[aà]\s*changer)\b/i, "battery-problem", "problème batterie"],
  [/\b(?:ecran|[eé]cran|screen)\s*(?:non\s*original|compatible|copy|copie)\b/i, "non-original-screen", "écran non original"]
];

const MEDIUM_PATTERNS: Array<[RegExp, string, string]> = [
  [/\b(?:rayures?|scratch(?:es)?|micro\s*rayures?)\b/i, "scratches", "rayures"],
  [/\b(?:sans\s*facture|no\s*invoice|facture\s*perdue)\b/i, "missing-invoice", "facture absente"],
  [/\b(?:n[eé]gociable|urgent|prix\s*bas)\b/i, "urgent-or-negotiable-listing", "annonce urgente ou négociable"],
  [/\b(?:batterie|battery)\s*(?:chang[eé]e?|remplac[eé]e?|non\s*originale?)\b/i, "battery-replaced", "batterie remplacée"],
  [/\b(?:ecran|[eé]cran|screen)\s*(?:chang[eé]?|remplac[eé]?)\b/i, "screen-replaced", "écran remplacé"],
  [/\b(?:sans\s*bo[iî]te|no\s*box|bo[iî]te\s*perdue)\b/i, "missing-box", "boîte absente"]
];

export function findRiskSignals(listing: Listing): RiskSignal[] {
  const text = [listing.title, listing.description, listing.condition].filter(Boolean).join(" ");
  const signals: RiskSignal[] = [];

  for (const [pattern, code, label] of REJECT_PATTERNS) {
    if (pattern.test(text)) signals.push({ code, label, severity: "reject" });
  }
  if (isAccessoryOnly(listing.title, listing.description)) {
    signals.push({ code: "accessory-only", label: "accessoire uniquement", severity: "reject" });
  }
  for (const [pattern, code, label] of HIGH_PATTERNS) {
    if (pattern.test(text)) signals.push({ code, label, severity: "high" });
  }
  for (const [pattern, code, label] of MEDIUM_PATTERNS) {
    if (pattern.test(text)) signals.push({ code, label, severity: "medium" });
  }
  signals.push(...batteryHealthRisks(text));

  if (listing.sellerReviews !== undefined && listing.sellerReviews < 5) {
    signals.push({ code: "low-seller-history", label: "historique vendeur faible", severity: "medium" });
  }
  if (listing.sellerRating !== undefined && listing.sellerRating < 4.2) {
    signals.push({ code: "low-seller-rating", label: "note vendeur faible", severity: "high" });
  }
  if (listing.price < 100) {
    signals.push({ code: "unrealistic-phone-price", label: "prix téléphone irréaliste", severity: "reject" });
  }
  if (!listing.imageUrl) {
    signals.push({ code: "missing-image", label: "image absente", severity: "high" });
  }

  return dedupeSignals(signals);
}

function batteryHealthRisks(text: string): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const matches = [
    ...text.matchAll(/\b(?:batterie|battery)[^\d]{0,20}(\d{2,3})\s?%/gi),
    ...text.matchAll(/\b(\d{2,3})\s?%[^\w]{0,20}(?:batterie|battery)\b/gi)
  ];

  for (const match of matches) {
    const health = Number(match[1]);
    if (!Number.isFinite(health) || health > 100) continue;
    if (health < 80) {
      signals.push({ code: "battery-health-below-80", label: "batterie sous 80%", severity: "high" });
      continue;
    }
    if (health < 85) {
      signals.push({ code: "battery-health-below-85", label: "batterie sous 85%", severity: "medium" });
    }
  }

  return signals;
}

export function riskPenalty(signals: RiskSignal[]): number {
  return signals.reduce((total, signal) => {
    if (signal.severity === "reject") return total + 100;
    if (signal.severity === "high") return total + 18;
    if (signal.severity === "medium") return total + 8;
    return total + 3;
  }, 0);
}

function dedupeSignals(signals: RiskSignal[]): RiskSignal[] {
  const byCode = new Map<string, RiskSignal>();
  for (const signal of signals) byCode.set(signal.code, signal);
  return [...byCode.values()];
}

function isAccessoryOnly(title: string, description: string): boolean {
  const titleMatches = ACCESSORY_ONLY_PATTERNS.some((pattern) => pattern.test(title));
  if (titleMatches) return true;

  const combined = `${title} ${description}`;
  return /\b(?:vendu|article|annonce|listing)\s*:?\s*(?:coque|case|cover|housse|etui|[eé]tui|funda|hoesje|chargeur|charger|cable|c[âa]ble|accessoire|protection)\b/i.test(combined);
}
