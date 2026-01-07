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
- `PROVIDER_BASE_URL`
- `PROVIDER_API_KEY`
- `PROVIDER_HOST` (optional, only if your provider needs a custom host header)
- `PROVIDER_ACTOR_ID` (Apify actor ID, e.g. `apify~e-commerce-scraping-tool`)
- `PROVIDER_TIMEOUT_MS` (optional, defaults to 60000)
- `PROVIDER_INCLUDE_EXTRA` (optional, set to `true` to include extra fields from Apify)
- `PROVIDER_BATCH_SIZE` (optional, defaults to 3)

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
Use this when Edge Functions hit resource limits. It runs locally and writes to `price_cache`.

```bash
set -a; source .env; set +a
node scripts/refreshPricesLocal.ts --stores=tesco --limit=10 --force --batch=3
```

Flags:
- `--stores=tesco,asda`
- `--limit=50`
- `--batch=3`
- `--timeout=60000`
- `--include-extra`
- `--include-store`

## Scheduled dataset refresh (recommended for scale)
Let Apify run on a schedule, then ingest the latest dataset into Supabase.

1) In Apify, configure a **Schedule** for your actor and make sure it outputs to a dataset.
2) Set `PROVIDER_DATASET_ID` in `.env` (or leave it blank to use the latest actor run dataset).
3) Run:

```bash
set -a; source .env; set +a
node scripts/refreshPricesFromDataset.ts --max-items=1000 --page-size=200
```

Optional flags:
- `--dataset=<datasetId>`
- `--page-size=200`
- `--max-items=1000`

3) Optional: report missing canonical items from recipes:

```bash
node scripts/mapMissingFromRecipes.ts
```

## Testing the Apify actor
Once you have a real product URL from one of the supported stores, run:

```bash
node scripts/testApifyActor.js "https://www.tesco.com/groceries/en-GB/products/..."
```

Use the output fields to update the mapping in `supabase/functions/quote/providers/providerApi.ts`.

## Price refresh (Option A)
`quote` is cache-only. Use `refresh-prices` to pull provider data into `price_cache`.

Example refresh (cache miss or stale only):
```bash
curl -X POST "$SUPABASE_URL/functions/v1/refresh-prices" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"stores":["tesco","asda","morrisons"],"limit":50}'
```

Force refresh (even if cached):
```bash
curl -X POST "$SUPABASE_URL/functions/v1/refresh-prices" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"stores":["tesco"],"force":true,"limit":50}'
```

## Provider adapter (Option A)
Provider calls live in `supabase/functions/quote/providers/providerApi.ts` and are used by `refresh-prices`.

TODOs when wiring the real provider:
- If using Apify, set `PROVIDER_BASE_URL=https://api.apify.com/v2` and `PROVIDER_ACTOR_ID=apify~e-commerce-scraping-tool`.
- Update the item field mapping in `getProductPrice` to match the actor output.
- Replace placeholder `provider_product_id` values in `store_products` with product URLs supported by the actor.

## Adding canonical items and mappings
1) Insert into `canonical_items` with `unit_type` in `GRAM | ML | COUNT`.
2) Add any aliases in `aliases` for matching (case-insensitive).
3) Insert into `store_products` for each store and set `provider_product_id`.
4) Map via `canonical_to_store_product`.

## Local app flow
- The Shop tab builds a canonical basket from menu items.
- It calls the quote endpoint and renders per-store totals, last updated, and missing items.
- If quotes fail or env vars are missing, it falls back to the local estimate and labels it clearly.
