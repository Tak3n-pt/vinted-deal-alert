import type { Listing, PhoneMatch } from "./types.js";

const STORAGE_RE = /\b(64|128|256|512|1000|1024)\s?(?:go|gb|g|giga|to|tb)\b/i;

const IPHONE_RE =
  /\b(?:apple\s*)?iphone\s*(13|14|15|16)\s*(pro\s*max|promax|pro|plus)?\b/i;

const GALAXY_S_RE =
  /\b(?:samsung\s*)?(?:galaxy\s*)?s\s?(22|23|24|25)\s*(ultra|\+|plus)?\b/i;

const GALAXY_Z_RE =
  /\b(?:samsung\s*)?(?:galaxy\s*)?z\s*(fold|flip)\s*(4|5|6|7)\b/i;

export function matchPhone(listing: Listing): PhoneMatch | null {
  const text = searchableText(listing);
  const storageGb = extractStorage(text);

  const iphone = IPHONE_RE.exec(text);
  if (iphone) {
    const generation = Number(iphone[1]);
    const suffix = normalizeSuffix(iphone[2]);
    if (generation >= 13 && (suffix === "pro" || suffix === "pro-max")) {
      const result: PhoneMatch = {
        brand: "apple",
        family: "iPhone",
        model: `iPhone ${generation} ${suffix === "pro-max" ? "Pro Max" : "Pro"}`,
        generation,
        tier: suffix,
        confidence: storageGb ? 0.98 : 0.88
      };
      if (storageGb !== undefined) result.storageGb = storageGb;
      return result;
    }
  }

  const galaxyS = GALAXY_S_RE.exec(text);
  if (galaxyS) {
    const generation = Number(galaxyS[1]);
    const suffix = normalizeSuffix(galaxyS[2]);
    if (generation >= 22 && (suffix === "ultra" || suffix === "plus")) {
      const result: PhoneMatch = {
        brand: "samsung",
        family: "Galaxy S",
        model: `Samsung Galaxy S${generation} ${suffix === "ultra" ? "Ultra" : "Plus"}`,
        generation,
        tier: suffix,
        confidence: storageGb ? 0.96 : 0.86
      };
      if (storageGb !== undefined) result.storageGb = storageGb;
      return result;
    }
  }

  const galaxyZ = GALAXY_Z_RE.exec(text);
  if (galaxyZ) {
    const foldOrFlip = galaxyZ[1]?.toLowerCase();
    const generation = Number(galaxyZ[2]);
    if ((foldOrFlip === "fold" || foldOrFlip === "flip") && generation >= 4) {
      const result: PhoneMatch = {
        brand: "samsung",
        family: "Galaxy Z",
        model: `Samsung Galaxy Z ${capitalize(foldOrFlip)} ${generation}`,
        generation,
        tier: foldOrFlip,
        confidence: storageGb ? 0.95 : 0.85
      };
      if (storageGb !== undefined) result.storageGb = storageGb;
      return result;
    }
  }

  return null;
}

export function benchmarkKey(match: PhoneMatch, conditionBucket: string): string {
  return [
    match.brand,
    match.family,
    match.model,
    match.storageGb ? `${match.storageGb}gb` : "unknown-storage",
    conditionBucket
  ].join("|");
}

export function extractStorage(text: string): number | undefined {
  const match = STORAGE_RE.exec(text);
  if (!match?.[1]) return undefined;
  const raw = Number(match[1]);
  return raw === 1000 || raw === 1024 ? 1024 : raw;
}

function searchableText(listing: Listing): string {
  return [listing.title, listing.description, listing.condition, listing.brand].filter(Boolean).join(" ");
}

function normalizeSuffix(value: string | undefined): PhoneMatch["tier"] | "" {
  const normalized = (value ?? "").toLowerCase().replace(/\s+/g, "");
  if (normalized === "promax") return "pro-max";
  if (normalized === "pro") return "pro";
  if (normalized === "ultra") return "ultra";
  if (normalized === "+" || normalized === "plus") return "plus";
  return "";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
