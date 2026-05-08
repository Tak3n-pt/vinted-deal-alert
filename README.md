# Vinted Deal Alert

Discord alerts for strong Vinted.fr deals on recent flagship iPhone and Samsung phones.

This project intentionally uses an authorized listing-data API boundary. Vinted restricts external bots, scraping, data mining, and automated account/transaction behavior unless authorized by Vinted. The service does not log in to Vinted, scrape Vinted directly, favorite items, message sellers, add carts, or buy anything.

## What It Finds

V1 only evaluates:

- iPhone 13 Pro / Pro Max and newer
- Samsung Galaxy S22+ / Ultra and newer
- Samsung Galaxy Z Fold / Flip 4 and newer

It rejects locked, blacklisted, broken, parts-only, replica, dummy, accessory-only, and other high-risk listings. Balanced mode allows cosmetic issues only when the discount is strong.

## Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in:

   - `PROVIDER_TYPE=apify`
   - `APIFY_TOKEN`
   - `APIFY_ACTOR_ID`
   - `AUTHORIZED_DATA_API_URL`
   - `AUTHORIZED_DATA_API_KEY`
   - `DISCORD_WEBHOOK_URL`
   - `PROVIDER_TIMEOUT_SECONDS`
   - `MAX_PRODUCTS_PER_SCAN`
   - `HEARTBEAT_EVERY_SCANS`

   For Apify, `AUTHORIZED_DATA_API_URL` and `AUTHORIZED_DATA_API_KEY` are not used.
   Locally, the bot uses SQLite at `DATABASE_PATH`. On hosted deployments, set `DATABASE_URL` to a Postgres connection string, for example Neon, so dashboard settings, scan history, and sent-alert tracking survive restarts.

3. Run a one-shot scan:

   ```powershell
   npm run once
   ```

4. Run continuously:

   ```powershell
   npm start
   ```

5. Run the web dashboard:

   ```powershell
   npm run dashboard
   ```

   The dashboard serves the React UI and the bot scheduler from the same Node process. Set `DASHBOARD_ADMIN_PASSWORD` before exposing it online. Local default is `admin` only as a development fallback. Set `DASHBOARD_COOKIE_SECURE=true` when the app is served through HTTPS.

## Authorized Provider Contract

### Apify

Default Apify provider:

```env
PROVIDER_TYPE=apify
APIFY_ACTOR_ID=epicscrapers~vinted-search-scraper
```

The bot sends Apify input like:

```json
{
  "maxProducts": 10,
  "startUrls": [
    {
      "url": "https://www.vinted.fr/catalog?search_text=iphone+15+pro+256go&order=newest_first"
    }
  ]
}
```

### Generic Provider

The provider endpoint should accept `POST` JSON:

```json
{
  "market": "FR",
  "query": "iphone 15 pro",
  "limit": 50,
  "sort": "newest"
}
```

## Cost Controls

The default scan is intentionally narrow:

- 8 searches
- 10 products each
- 15-minute interval
- 100 products maximum per scan

This prevents accidental high Apify spend. If a custom `SEARCH_CONFIG_PATH` requests more than `MAX_PRODUCTS_PER_SCAN`, the bot refuses to start.

For better precision, use copied Vinted.fr filtered URLs in `config.searches.example.json`:

```json
{
  "market": "FR",
  "url": "https://www.vinted.fr/catalog?search_text=iphone%2015%20pro%20256go&order=newest_first",
  "query": "iphone 15 pro 256go",
  "limit": 10,
  "sort": "newest"
}
```

The service accepts common response shapes:

```json
{
  "items": [
    {
      "id": "123",
      "title": "iPhone 15 Pro 256Go",
      "description": "Tres bon etat",
      "price": 650,
      "currency": "EUR",
      "url": "https://www.vinted.fr/items/123",
      "imageUrl": "https://...",
      "sellerRating": 4.9,
      "sellerReviews": 42,
      "condition": "Very good",
      "listedAt": "2026-05-01T10:00:00Z"
    }
  ]
}
```

Arrays at the top level are also accepted. If your provider uses different field names, adapt `src/provider.ts`.

## Deal Logic

For each exact model/storage/condition bucket, the bot compares the product against a guarded market benchmark. If enough clean recent listings exist, it blends those prices with the built-in fallback benchmark. Unrealistic history prices are ignored so one broken or fake listing does not pull the benchmark down.

When exact condition history is thin, the bot can also use related clean history for the same model and storage with lower weight. This keeps the benchmark useful without letting a small set of noisy listings dominate it.

The bot does not judge a deal from the raw Vinted item price alone. It uses the best final cost it has:

- the provider's total price when available,
- otherwise item price plus known service/shipping fields when available,
- otherwise an estimated final cost using item price plus a small buyer-fee/shipping estimate.

An alert is sent only when all of these are true:

- score, discount, and savings pass the model-specific threshold,
- there are no reject or high-risk signals.

Samsung and Fold models need slightly stronger discounts/savings because their market prices move faster. New top models need higher savings before alerting.

Reject and high-risk signals include locked phones, broken/parts listings, accessory-only results, missing images, very weak seller history on unusually cheap listings, very new seller accounts, seller/item country mismatch on deep discounts, repeated duplicate photos in the same scan, low battery health, non-original screens, and major condition problems like cracked screens.

Each listing is alerted once. It re-alerts only if the same listing drops by at least 10%.

`HEARTBEAT_EVERY_SCANS=4` sends a Discord status message every 4 scans so you know the bot is still running even when there are no good deals. The message includes scan counts and the best candidate from the last scan. Set it to `0` to disable heartbeat messages.

## Scripts

```powershell
npm run once
npm start
npm run dashboard
npm run sample
npm test
npm run check
npm run build
```

## Dashboard

The dashboard is available on `http://localhost:3000` by default and exposes:

- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `/api/status`, `/api/bot/scan-now`, `/api/bot/pause`, `/api/bot/resume`
- `/api/settings`, `/api/searches`, `/api/model-rules`, `/api/risk-rules`
- `/api/deals`, `/api/scans`, `/api/logs`

Admin sessions use an HTTP-only cookie. Discord webhook, Apify token, and generic provider key are write-only in the UI: the API only returns whether each secret is configured.

The bot reads dashboard settings, searches, model rules, and risk rules before each scan. If the dashboard tables are empty, it falls back to the original defaults.

## Render + Neon

Use these settings for a no-card hosted v1:

- Build command: `npm ci && npm run build`
- Start command: `npm run serve`
- Runtime env: `NODE_ENV=production`, `DASHBOARD_COOKIE_SECURE=true`, `DATABASE_URL=<Neon connection string>`

When `DATABASE_URL` is present, both dashboard data and alert history use Postgres. Without it, the app falls back to local SQLite.
