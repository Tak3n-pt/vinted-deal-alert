export type Currency = "EUR" | string;

export interface RawListing {
  id?: string | number;
  title?: string;
  description?: string;
  price?: number | string | { amount?: number | string; currency_code?: string; currency?: string };
  totalPrice?: number | string | { amount?: number | string; currency_code?: string; currency?: string };
  total_item_price?: number | string | { amount?: number | string; currency_code?: string; currency?: string };
  service_fee?: number | string | { amount?: number | string; currency_code?: string; currency?: string };
  shipment_price?: number | string | { amount?: number | string; currency_code?: string; currency?: string };
  currency?: Currency;
  url?: string;
  link?: string;
  path?: string;
  imageUrl?: string;
  image?: string;
  photo?: { url?: string };
  photos?: Array<{ url?: string; full_size_url?: string; is_main?: boolean } | string>;
  sellerName?: string;
  sellerRating?: number | string;
  sellerReviews?: number | string;
  sellerFeedbacks?: number | string;
  sellerJoinedAt?: string;
  sellerCountry?: string;
  sellerLocation?: string;
  itemCountry?: string;
  itemLocation?: string;
  user?: {
    login?: string;
    profile_url?: string;
    feedback_reputation?: number | string;
    feedback_count?: number | string;
    item_count?: number | string;
    created_at?: string;
    createdAt?: string;
    country_code?: string;
    country?: string;
    city?: string;
  };
  condition?: string;
  status?: string;
  brand?: string;
  brand_title?: string;
  createdAt?: string;
  listedAt?: string;
  date?: string;
  favouriteCount?: number;
  favourite_count?: number;
  [key: string]: unknown;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  totalPrice?: number;
  currency: Currency;
  url: string;
  imageUrl?: string;
  sellerName?: string;
  sellerRating?: number;
  sellerReviews?: number;
  sellerItemCount?: number;
  sellerProfileUrl?: string;
  sellerJoinedAt?: string;
  sellerCountry?: string;
  sellerLocation?: string;
  itemCountry?: string;
  itemLocation?: string;
  condition?: string;
  brand?: string;
  listedAt?: string;
  favoriteCount?: number;
  raw: RawListing;
}

export type Brand = "apple" | "samsung" | "google";

export interface PhoneMatch {
  brand: Brand;
  family: string;
  model: string;
  generation: number;
  tier: "pro" | "pro-max" | "pro-xl" | "plus" | "ultra" | "fold" | "flip";
  storageGb?: number;
  confidence: number;
}

export interface RiskSignal {
  code: string;
  label: string;
  severity: "reject" | "high" | "medium" | "low";
}

export interface ScoredDeal {
  listing: Listing;
  match: PhoneMatch;
  benchmarkPrice: number;
  finalPrice: number;
  discountPercent: number;
  savings: number;
  score: number;
  risks: RiskSignal[];
  reasons: string[];
  rejectionReasons: string[];
  shouldAlert: boolean;
}

export interface SearchConfig {
  query: string;
  url?: string;
  market: "FR";
  limit: number;
  sort: "newest";
}

export interface RuntimeConfig {
  providerType: "generic" | "apify";
  authorizedDataApiUrl: string;
  authorizedDataApiKey: string;
  apifyToken?: string;
  apifyActorId: string;
  apifyDetailActorId: string;
  discordWebhookUrl: string;
  pollIntervalSeconds: number;
  providerTimeoutSeconds: number;
  maxProductsPerScan: number;
  heartbeatEveryScans: number;
  databasePath: string;
  runOnStart: boolean;
  dryRun: boolean;
}
