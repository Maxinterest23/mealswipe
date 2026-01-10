# Price Comparison (Quotes)

## Overview
This repo uses Supabase Edge Functions plus Postgres tables to return per-store basket estimates. The app sends a canonicalized basket to the backend; the backend reads cached prices and applies pack-size math.

## Supabase setup
1) Create a Supabase project (or use local Supabase).
2) Run migrations:

```bash
supabase db push
```

If you are not using the Supabase CLI, apply the SQL in `supabase/migrations/20250112000100_price_comparison.sql` manually.

## Edge Functions
Deploy the functions from `supabase/functions/quote` and `supabase/functions/refresh-prices`:

```bash
supabase functions deploy quote
supabase functions deploy refresh-prices
```

Local dev:

```bash
supabase functions serve quote --env-file .env
supabase functions serve refresh-prices --env-file .env
```

## Required env vars
Backend (`supabase/functions/quote`):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCRAPER_TIMEOUT_MS` (optional, defaults to 30000)
- `SCRAPER_USER_AGENT` (optional, defaults to a desktop Chrome UA)
- `SCRAPER_BATCH_SIZE` (optional, defaults to 3)
- `SCRAPER_STORAGE_STATE` (optional, defaults to `scripts/scraper-storage.json`)
- `SCRAPER_DISABLE_HTTP2` (optional, defaults to true)

App (`Expo`):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_QUOTES_ENDPOINT` (optional override; defaults to `${SUPABASE_URL}/functions/v1/quote`)

## Database schema
Tables (see migration for full definitions):
- `canonical_items`
- `store_products`
- `canonical_to_store_product`
- `price_cache`
- `quote_logs` (optional)

Note: `price_cache.postcode_area` uses `GLOBAL` when no postcode is provided so it remains part of the cache key.

## Seeding
1) Seed canonical items from existing recipes:

```bash
node scripts/seedCanonicalItems.ts
```

2) Seed store product mappings (placeholder IDs):

```bash
node scripts/seedStoreMappings.ts
```

## Local refresh (no Edge limits)
Use this when Edge Functions hit resource limits. It scrapes Tesco/Morrisons directly and writes to `price_cache`.

```bash
set -a; source .env; set +a
node scripts/refreshPricesLocal.ts --stores=tesco,morrisons --limit=200 --force --batch=4
```

Flags:
- `--stores=tesco,morrisons`
- `--limit=200`
- `--batch=4`
- `--timeout=30000`

## Playwright refresh (headless + cookies)
If Tesco/Morrisons blocks plain fetch, use Playwright with a saved session.

Install Playwright and browsers:
```bash
npm install -D playwright
npx playwright install chromium
```

Save a session (headful so you can pass bot checks/login):
```bash
node scripts/saveScraperSession.ts --tesco
```

Headless refresh using cookies:
```bash
set -a; source .env; set +a
node scripts/refreshPricesPlaywright.ts --stores=tesco,morrisons --limit=50 --batch=2 --force
```

Optional envs:
- `SCRAPER_STORAGE_STATE` (defaults to `scripts/scraper-storage.json`)
- `SCRAPER_USER_AGENT`
- `SCRAPER_TIMEOUT_MS`
- `SCRAPER_DISABLE_HTTP2` (defaults to true)
- `SCRAPER_NAV_WAIT_UNTIL` (defaults to `commit`)
- `SCRAPER_POST_NAV_WAIT_MS` (defaults to 750)
- `SCRAPER_BLOCK_RESOURCES` (defaults to true)

Optional flags:
- `--wait-until=commit|domcontentloaded|load|networkidle`
- `--post-wait=750`
- `--no-block-resources`

## Scheduled daily scrape
Run the local scraper once per day (cron, GitHub Actions, etc.) and let `quote` read from `price_cache`.

Example cron (03:00 daily):
```bash
0 3 * * * cd /path/to/MealSwipeRN-v3 && set -a; source .env; set +a && node scripts/refreshPricesLocal.ts --stores=tesco,morrisons --force --limit=200
```

## Price refresh (Option A)
`quote` is cache-only. Use `refresh-prices` to pull provider data into `price_cache`.

Example refresh (cache miss or stale only):
```bash
curl -X POST "$SUPABASE_URL/functions/v1/refresh-prices" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"stores":["tesco","morrisons"],"limit":50}'
```

Force refresh (even if cached):
```bash
curl -X POST "$SUPABASE_URL/functions/v1/refresh-prices" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"stores":["tesco"],"force":true,"limit":50}'
```

## Scraper adapter (Option A)
Scraper calls live in `supabase/functions/quote/providers/providerApi.ts` and are used by `refresh-prices`.

Requirements:
- `provider_product_id` in `store_products` must be a Tesco/Morrisons product URL.
- Keep other stores inactive or exclude them from refresh calls.

## Adding canonical items and mappings
1) Insert into `canonical_items` with `unit_type` in `GRAM | ML | COUNT`.
2) Add any aliases in `aliases` for matching (case-insensitive).
3) Insert into `store_products` for each store and set `provider_product_id`.
4) Map via `canonical_to_store_product`.

## Local app flow
- The Shop tab builds a canonical basket from menu items.
- It calls the quote endpoint and renders per-store totals, last updated, and missing items.
- If quotes fail or env vars are missing, it falls back to the local estimate and labels it clearly.
