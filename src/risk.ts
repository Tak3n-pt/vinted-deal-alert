import type { Listing, RiskSignal } from "./types.js";

const REJECT_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:icloud|i cloud)\s*(?:bloqu|lock|blocked|verrouill)/i, "iCloud locked"],
  [/\b(?:simlock|sim\s*lock|bloqu[eé]\s*op[eé]rateur|operator locked)\b/i, "operator locked"],
  [/\b(?:blacklist|blacklisted|imei\s*(?:bloqu|blacklist|hs))\b/i, "blacklisted IMEI"],
  [/\b(?:pour\s*pi[eè]ces|for\s*parts|pi[eè]ces\s*d[eé]tach[eé]es)\b/i, "parts only"],
  [/\b(?:ne\s*s['’]?allume\s*pas|does\s*not\s*turn\s*on|dead|hs)\b/i, "does not turn on"],
  [/\b(?:r[eé]plique|replica|fake|clone|dummy|factice)\b/i, "replica or dummy"],
  [/\b(?:apple\s*watch|airpods|ipad)\b/i, "bundle or different device"]
];

const ACCESSORY_ONLY_PATTERNS: RegExp[] = [
  /\b(?:coque|case|cover|housse|etui|[eé]tui|funda|hoesje|h[uü]lle|capa|custodia|bumper|burga)\b/i,
  /\b(?:display|schermo|lcd|screen|[eé]cran)\s+(?:original|originale|for|pour|iphone|samsung|galaxy)\b/i,
  /\b(?:chargeur|charger|cable|c[âa]ble|adapter|adaptateur|accessoire|protection|protector|screen\s*protector|verre\s*tremp[eé]|film\s*(?:protecteur|protection))\b/i,
  /\b(?:lot\s+de\s+)?(?:coques|cases|covers|housses|etuis|[eé]tuis|fundas|hoesjes|h[uü]llen|chargeurs|chargers|cables|accessoires|protections)\b/i
];

const HIGH_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:face\s*id\s*(?:hs|ne marche pas|ko)|faceid\s*(?:hs|ko))\b/i, "Face ID issue"],
  [/\b(?:ecran|[eé]cran|screen)\s*(?:cass[eé]|cracked|fissur[eé])/i, "cracked screen"],
  [/\b(?:dos|back|vitre\s*arri[eè]re)\s*(?:cass[eé]|cracked|fissur[eé])/i, "cracked back"],
  [/\b(?:batterie|battery)\s*(?:hs|faible|weak|a\s*changer|[aà]\s*changer)\b/i, "battery problem"],
  [/\b(?:ecran|[eé]cran|screen)\s*(?:non\s*original|compatible|copy|copie)\b/i, "non-original screen"]
];

const MEDIUM_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:rayures?|scratch(?:es)?|micro\s*rayures?)\b/i, "scratches"],
  [/\b(?:sans\s*facture|no\s*invoice|facture\s*perdue)\b/i, "missing invoice"],
  [/\b(?:n[eé]gociable|urgent|prix\s*bas)\b/i, "urgent or negotiable listing"],
  [/\b(?:batterie|battery)\s*(?:chang[eé]e?|remplac[eé]e?|non\s*originale?)\b/i, "battery replaced"],
  [/\b(?:ecran|[eé]cran|screen)\s*(?:chang[eé]?|remplac[eé]?)\b/i, "screen replaced"],
  [/\b(?:sans\s*bo[iî]te|no\s*box|bo[iî]te\s*perdue)\b/i, "missing box"]
];

export function findRiskSignals(listing: Listing): RiskSignal[] {
  const text = [listing.title, listing.description, listing.condition].filter(Boolean).join(" ");
  const signals: RiskSignal[] = [];

  for (const [pattern, label] of REJECT_PATTERNS) {
    if (pattern.test(text)) signals.push({ code: slug(label), label, severity: "reject" });
  }
  if (isAccessoryOnly(listing.title, listing.description)) {
    signals.push({ code: "accessory-only", label: "accessory only", severity: "reject" });
  }
  for (const [pattern, label] of HIGH_PATTERNS) {
    if (pattern.test(text)) signals.push({ code: slug(label), label, severity: "high" });
  }
  for (const [pattern, label] of MEDIUM_PATTERNS) {
    if (pattern.test(text)) signals.push({ code: slug(label), label, severity: "medium" });
  }
  signals.push(...batteryHealthRisks(text));

  if (listing.sellerReviews !== undefined && listing.sellerReviews < 5) {
    signals.push({ code: "low-seller-history", label: "low seller history", severity: "medium" });
  }
  if (listing.sellerRating !== undefined && listing.sellerRating < 4.2) {
    signals.push({ code: "low-seller-rating", label: "low seller rating", severity: "high" });
  }
  if (listing.price < 100) {
    signals.push({ code: "unrealistic-phone-price", label: "unrealistic phone price", severity: "reject" });
  }
  if (!listing.imageUrl) {
    signals.push({ code: "missing-image", label: "missing image", severity: "high" });
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
      signals.push({ code: "battery-health-below-80", label: "battery health below 80%", severity: "high" });
      continue;
    }
    if (health < 85) {
      signals.push({ code: "battery-health-below-85", label: "battery health below 85%", severity: "medium" });
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

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
