import fs from 'fs';
import path from 'path';

interface CanonicalItemRow {
  name: string;
  aliases: string[] | null;
}

interface RecipeSeed {
  ingredients: Array<{
    canonicalName: string;
  }>;
}

function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

async function fetchCanonicalItems(supabaseUrl: string, apiKey: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/canonical_items?select=name,aliases`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fetch canonical items failed: ${response.status} ${text}`);
  }

  const rows = (await response.json()) as CanonicalItemRow[];
  const lookup = new Set<string>();

  rows.forEach((row) => {
    lookup.add(normalizeKey(row.name));
    (row.aliases ?? []).forEach((alias) => lookup.add(normalizeKey(alias)));
  });

  return lookup;
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !apiKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const canonicalLookup = await fetchCanonicalItems(supabaseUrl, apiKey);
  const missing = new Set<string>();

  const recipesModule = await import(new URL('../data/mockRecipes.ts', import.meta.url).href);
  const recipes = recipesModule.mockRecipes as RecipeSeed[];

  recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      const key = normalizeKey(ingredient.canonicalName);
      if (!canonicalLookup.has(key)) {
        missing.add(ingredient.canonicalName);
      }
    });
  });

  if (!missing.size) {
    console.log('All recipe ingredients are mapped to canonical items.');
    return;
  }

  console.log('Missing canonical items from recipes:');
  Array.from(missing)
    .sort()
    .forEach((item) => console.log(`- ${item}`));
}

main().catch((error) => {
  console.error('Mapping report failed:', error);
  process.exit(1);
});
