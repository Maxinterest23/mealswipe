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

## Content Pipeline TODO

- TODO: Ingest -> normalize -> validate -> publish (recipes_raw -> recipes_normalized -> recipes_published)
