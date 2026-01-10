# MealSwipe - React Native (Expo SDK 54)

Simple TikTok-style recipe discovery app.

## Quick Start

```bash
cd MealSwipeRN-v3
npm install
npx expo start
```

Scan QR code with Expo Go on your phone.

## Features

- Swipe through recipes
- Tap to flip and see ingredients
- Build weekly menu  
- Generate grocery list
- Tesco integration

## Endless Feed (Supabase)

1. Create a Supabase project.
2. Run the schema in `supabase/schema.sql` via the Supabase SQL editor.
3. Copy `.env.example` to `.env` and fill in:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_USE_REMOTE_FEED=true` (optional; defaults to on when URL/key are set)
   - `SUPABASE_SERVICE_ROLE_KEY` (required for seeding)
4. Seed the existing local recipes into Supabase:

```bash
npx tsx scripts/seedRecipes.ts
```

5. Start the app as usual:

```bash
npx expo start
```

To force local-only data, set `EXPO_PUBLIC_USE_REMOTE_FEED=false`.

## Price Comparison (Quotes)

See `docs/price-comparison.md` for full setup and seeding instructions.

Quick steps:
1. Apply the migration in `supabase/migrations/20250112000100_price_comparison.sql`.
2. Deploy/serve the Edge Function `quote`.
3. Set Expo env vars:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_QUOTES_ENDPOINT` (optional override)
4. Seed canonical items and store mappings:

```bash
node scripts/seedCanonicalItems.ts
node scripts/seedStoreMappings.ts
```

Scraper wiring (server-only):
- Optional: set `SCRAPER_TIMEOUT_MS` and `SCRAPER_USER_AGENT`.
- Replace placeholder `provider_product_id` values in `store_products` with Tesco/Morrisons product URLs.

If Tesco/Morrisons blocks plain fetch, use the Playwright flow in `docs/price-comparison.md`.

## Content Pipeline TODO

- TODO: Ingest -> normalize -> validate -> publish (recipes_raw -> recipes_normalized -> recipes_published)
