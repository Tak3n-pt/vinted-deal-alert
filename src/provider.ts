import type { Listing, RawListing, RuntimeConfig, SearchConfig } from "./types.js";

export interface ListingProvider {
  search(search: SearchConfig): Promise<Listing[]>;
  fetchListingDetails?(urls: string[]): Promise<Listing[]>;
}

export class SearchResultCache {
  readonly stats = { hits: 0, misses: 0 };
  private readonly cache = new Map<string, Promise<Listing[]>>();

  async getOrFetch(namespace: string, search: SearchConfig, fetcher: () => Promise<Listing[]>): Promise<Listing[]> {
    const key = `${namespace}|${searchCacheKey(search)}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.stats.hits += 1;
      return cloneListings(await cached);
    }

    this.stats.misses += 1;
    const promise = fetcher()
      .then((listings) => cloneListings(listings))
      .catch((error) => {
        this.cache.delete(key);
        throw error;
      });
    this.cache.set(key, promise);
    return cloneListings(await promise);
  }
}

export class CachedListingProvider implements ListingProvider {
  constructor(
    private readonly upstream: ListingProvider,
    private readonly cache: SearchResultCache,
    private readonly namespace = "default"
  ) {}

  search(search: SearchConfig): Promise<Listing[]> {
    return this.cache.getOrFetch(this.namespace, search, () => this.upstream.search(search));
  }

  fetchListingDetails(urls: string[]): Promise<Listing[]> {
    return this.upstream.fetchListingDetails?.(urls) ?? Promise.resolve([]);
  }
}

export function providerCacheNamespace(config: RuntimeConfig): string {
  return [
    config.providerType,
    config.providerType === "apify" ? config.apifyActorId : config.authorizedDataApiUrl
  ].join("|");
}

export function searchCacheKey(search: SearchConfig): string {
  return JSON.stringify({
    market: search.market,
    query: search.query.trim().toLowerCase(),
    url: normalizeSearchUrl(search.url),
    limit: Math.max(1, Math.floor(search.limit)),
    sort: search.sort
  });
}

export function createListingProvider(config: RuntimeConfig): ListingProvider {
  if (config.providerType === "apify") return new ApifyVintedProvider(config);
  return new AuthorizedListingProvider(config);
}

export class AuthorizedListingProvider {
  constructor(private readonly config: RuntimeConfig) {}

  async search(search: SearchConfig): Promise<Listing[]> {
    if (!this.config.authorizedDataApiUrl || !this.config.authorizedDataApiKey) {
      throw new Error("AUTHORIZED_DATA_API_URL et AUTHORIZED_DATA_API_KEY sont requis pour la source générique");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.providerTimeoutSeconds * 1000);
    let response: Response;

    try {
      response = await fetch(this.config.authorizedDataApiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.authorizedDataApiKey}`
        },
        body: JSON.stringify(search),
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Délai de la source autorisée expiré après ${this.config.providerTimeoutSeconds}s`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Source autorisée en échec ${response.status} : ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as unknown;
    return extractRawListings(payload).map(normalizeListing).filter((item): item is Listing => item !== null);
  }
}

export class ApifyVintedProvider {
  constructor(private readonly config: RuntimeConfig) {}

  async search(search: SearchConfig): Promise<Listing[]> {
    if (!this.config.apifyToken) {
      throw new Error("APIFY_TOKEN est requis pour la source Apify");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.providerTimeoutSeconds * 1000);
    const url = new URL(`https://api.apify.com/v2/acts/${encodeURIComponent(this.config.apifyActorId)}/run-sync-get-dataset-items`);
    url.searchParams.set("clean", "true");
    url.searchParams.set("format", "json");

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        // Apify accepts the token via Authorization header. Sending it in the
        // URL leaks it in proxy/CDN access logs.
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apifyToken}`
        },
        body: JSON.stringify(toApifyInput(search)),
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Délai de la source Apify expiré après ${this.config.providerTimeoutSeconds}s`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Source Apify en échec ${response.status} : ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as unknown;
    return extractRawListings(payload).map(normalizeListing).filter((item): item is Listing => item !== null);
  }

  async fetchListingDetails(urls: string[]): Promise<Listing[]> {
    if (!urls.length) return [];
    if (!this.config.apifyToken) {
      throw new Error("APIFY_TOKEN est requis pour la source Apify");
    }
    const actorId = this.config.apifyDetailActorId;
    if (!actorId) {
      throw new Error("APIFY_DETAIL_ACTOR_ID est requis pour la vérification de détail");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.providerTimeoutSeconds * 1000);
    const url = new URL(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`);
    url.searchParams.set("clean", "true");
    url.searchParams.set("format", "json");

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apifyToken}`
        },
        body: JSON.stringify({ urls, startUrls: urls.map((u) => ({ url: u })) }),
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Délai actor détail expiré après ${this.config.providerTimeoutSeconds}s`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Actor détail en échec ${response.status} : ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as unknown;
    return extractRawListings(payload).map(normalizeListing).filter((item): item is Listing => item !== null);
  }
}

export function toApifyInput(search: SearchConfig): Record<string, unknown> {
  const url = search.url ? new URL(search.url) : new URL("https://www.vinted.fr/catalog");
  if (!search.url) {
    url.searchParams.set("search_text", search.query);
  }
  if (!url.searchParams.has("order")) {
    url.searchParams.set("order", search.sort === "newest" ? "newest_first" : search.sort);
  }

  return {
    // Honor the rotation slice exactly. Earlier code forced a 10-listing
    // minimum which silently doubled Apify spend when an operator set
    // MAX_PRODUCTS_PER_SCAN below 10.
    maxProducts: Math.max(1, Math.floor(search.limit)),
    startUrls: [{ url: url.toString() }]
  };
}

export function extractRawListings(payload: unknown): RawListing[] {
  if (Array.isArray(payload)) return payload as RawListing[];
  if (!payload || typeof payload !== "object") return [];

  const object = payload as Record<string, unknown>;
  for (const key of ["items", "listings", "results", "data"]) {
    const value = object[key];
    if (Array.isArray(value)) return value as RawListing[];
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      if (Array.isArray(nested.items)) return nested.items as RawListing[];
      if (Array.isArray(nested.results)) return nested.results as RawListing[];
    }
  }

  return [];
}

export function normalizeListing(raw: RawListing): Listing | null {
  const id = stringValue(raw.id);
  const title = stringValue(raw.title);
  const url = stringValue(raw.url) || stringValue(raw.link) || vintedUrlFromPath(raw.path);
  const itemPrice = priceValue(raw.price);
  const explicitTotalPrice = priceValue(raw.totalPrice ?? raw.total_item_price);
  const knownServiceFee = priceValue(raw.service_fee);
  const knownShipmentPrice = priceValue(raw.shipment_price);
  const knownAddOns = [knownServiceFee, knownShipmentPrice].filter(Number.isFinite).reduce((total, value) => total + value, 0);
  const knownTotalPrice = Number.isFinite(explicitTotalPrice)
    ? explicitTotalPrice
    : Number.isFinite(itemPrice) && knownAddOns > 0
      ? itemPrice + knownAddOns
      : Number.NaN;
  const price = Number.isFinite(itemPrice) ? itemPrice : knownTotalPrice;
  if (!id || !title || !url || !Number.isFinite(price) || price <= 0) return null;

  const photoFromArray = Array.isArray(raw.photos) ? mainPhoto(raw.photos) : undefined;
  const imageUrl =
    stringValue(raw.imageUrl) ||
    stringValue(raw.image) ||
    stringValue(raw.photo?.url) ||
    (typeof photoFromArray === "string" ? photoFromArray : stringValue(photoFromArray?.full_size_url) || stringValue(photoFromArray?.url));

  const sellerReviews = numberValue(raw.sellerReviews ?? raw.sellerFeedbacks ?? raw.user?.feedback_count);
  const listing: Listing = {
    id,
    title,
    description: stringValue(raw.description),
    price,
    currency: currencyValue(raw),
    url,
    raw
  };

  if (imageUrl) listing.imageUrl = imageUrl;
  const sellerName = stringValue(raw.sellerName) || stringValue(raw.user?.login);
  if (sellerName) listing.sellerName = sellerName;
  const sellerProfileUrl = stringValue(raw.user?.profile_url);
  if (sellerProfileUrl) listing.sellerProfileUrl = sellerProfileUrl;
  const sellerJoinedAt = stringValue(raw.sellerJoinedAt) || stringValue(raw.user?.created_at) || stringValue(raw.user?.createdAt);
  if (sellerJoinedAt) listing.sellerJoinedAt = sellerJoinedAt;
  const sellerCountry = countryValue(raw.sellerCountry) || countryValue(raw.user?.country_code) || countryValue(raw.user?.country);
  if (sellerCountry) listing.sellerCountry = sellerCountry;
  const sellerLocation = stringValue(raw.sellerLocation) || locationValue(raw.user?.city, raw.user?.country);
  if (sellerLocation) listing.sellerLocation = sellerLocation;
  const itemCountry = countryValue(raw.itemCountry) || countryValue(raw.country_code) || countryValue(raw.country) || countryValue(raw.country_title);
  if (itemCountry) listing.itemCountry = itemCountry;
  const itemLocation = stringValue(raw.itemLocation) || stringValue(raw.location) || locationValue(raw.city, raw.country_title ?? raw.country);
  if (itemLocation) listing.itemLocation = itemLocation;
  const sellerRating = normalizeSellerRating(numberValue(raw.sellerRating ?? raw.user?.feedback_reputation));
  if (sellerRating !== undefined) listing.sellerRating = sellerRating;
  if (sellerReviews !== undefined) listing.sellerReviews = sellerReviews;
  const sellerItemCount = numberValue(raw.user?.item_count);
  if (sellerItemCount !== undefined) listing.sellerItemCount = sellerItemCount;
  if (Number.isFinite(knownTotalPrice) && knownTotalPrice > price) listing.totalPrice = knownTotalPrice;
  const condition = stringValue(raw.condition) || stringValue(raw.status);
  if (condition) listing.condition = condition;
  const brand = stringValue(raw.brand) || stringValue(raw.brand_title);
  if (brand) listing.brand = brand;
  const listedAt = stringValue(raw.listedAt) || stringValue(raw.createdAt) || stringValue(raw.date);
  if (listedAt) listing.listedAt = listedAt;
  if (typeof raw.favouriteCount === "number") listing.favoriteCount = raw.favouriteCount;
  if (typeof raw.favourite_count === "number") listing.favoriteCount = raw.favourite_count;

  return listing;
}

function currencyValue(raw: RawListing): string {
  if (typeof raw.currency === "string") return raw.currency;
  if (raw.price && typeof raw.price === "object") {
    return raw.price.currency_code ?? raw.price.currency ?? "EUR";
  }
  return "EUR";
}

function priceValue(value: RawListing["price"] | RawListing["totalPrice"]): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseLocalizedNumber(value);
  if (value && typeof value === "object") {
    const amount = value.amount;
    if (typeof amount === "number") return amount;
    if (typeof amount === "string") return parseLocalizedNumber(amount);
  }
  return Number.NaN;
}

function parseLocalizedNumber(value: string): number {
  const normalized = value.replace(/\s/g, "").replace("€", "").replace(",", ".");
  return Number.parseFloat(normalized);
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Vinted's `feedback_reputation` is sometimes a 0-1 ratio (proportion of
 * positive feedback) and sometimes a 0-5 star value. Detect the ratio shape
 * and rescale to the 5-star convention used everywhere else.
 */
export function normalizeSellerRating(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) return undefined;
  if (value > 5) return 5;
  if (value > 1) return value;
  // value is in [0, 1] — assume ratio when strictly between 0 and 1, leave 0 alone
  if (value === 0) return 0;
  return Math.round(value * 5 * 10) / 10;
}

function countryValue(value: unknown): string {
  const text = stringValue(value).toUpperCase();
  if (!text) return "";
  const countryAliases: Record<string, string> = {
    FRANCE: "FR",
    FR: "FR",
    BELGIQUE: "BE",
    BELGIUM: "BE",
    BE: "BE",
    ESPAGNE: "ES",
    SPAIN: "ES",
    ES: "ES",
    ITALIE: "IT",
    ITALY: "IT",
    IT: "IT",
    ALLEMAGNE: "DE",
    GERMANY: "DE",
    DE: "DE",
    PAYS_BAS: "NL",
    NETHERLANDS: "NL",
    NL: "NL"
  };
  return countryAliases[text] ?? (text.length === 2 ? text : "");
}

function locationValue(city: unknown, country: unknown): string {
  return [stringValue(city), stringValue(country)].filter(Boolean).join(", ");
}

function vintedUrlFromPath(path: unknown): string {
  const value = stringValue(path);
  if (!value) return "";
  return value.startsWith("http") ? value : `https://www.vinted.fr${value.startsWith("/") ? value : `/${value}`}`;
}

function mainPhoto(photos: NonNullable<RawListing["photos"]>): NonNullable<RawListing["photos"]>[number] | undefined {
  const objectPhotos = photos.filter((photo): photo is Exclude<typeof photo, string> => typeof photo === "object" && photo !== null);
  return objectPhotos.find((photo) => photo.is_main) ?? photos[0];
}

function normalizeSearchUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.trim();
  }
}

function cloneListings(listings: Listing[]): Listing[] {
  return listings.map((listing) => ({ ...listing }));
}
