import fs from 'fs';
import path from 'path';

interface CanonicalItemInsert {
  name: string;
  unit_type: 'GRAM' | 'ML' | 'COUNT';
  category: string | null;
  aliases: string[];
  is_pantry: boolean;
}

interface RecipeSeed {
  ingredients: Array<{
    name: string;
    canonicalName: string;
    quantity: number;
    unit: string;
    category?: string;
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

function unitTypeFromUnit(unit: string): 'GRAM' | 'ML' | 'COUNT' {
  const normalized = unit.trim().toLowerCase();
  if (['g', 'gram', 'grams', 'kg'].includes(normalized)) return 'GRAM';
  if (['ml', 'l', 'tsp', 'tbsp'].includes(normalized)) return 'ML';
  if (['piece', 'pieces', 'clove', 'cloves'].includes(normalized)) return 'COUNT';
  return 'COUNT';
}

function buildCanonicalItems(recipes: RecipeSeed[]): CanonicalItemInsert[] {
  const map = new Map<string, CanonicalItemInsert>();

  recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      const key = ingredient.canonicalName.trim().toLowerCase();
      if (!key) return;

      const entry = map.get(key) ?? {
        name: ingredient.canonicalName.trim(),
        unit_type: unitTypeFromUnit(ingredient.unit),
        category: ingredient.category ?? null,
        aliases: [],
        is_pantry: false,
      };

      const alias = ingredient.name.trim();
      if (alias && !entry.aliases.includes(alias)) {
        entry.aliases.push(alias);
      }

      map.set(key, entry);
    });
  });

  const extraItems: CanonicalItemInsert[] = [
    {
      name: 'cheddar cheese',
      unit_type: 'GRAM',
      category: 'Dairy & Eggs',
      aliases: [
        'cheddar',
        'mature cheddar',
        'mature cheddar cheese',
        'cheddar cheese 350g',
        'cathedral city cheddar',
      ],
      is_pantry: false,
    },
  ];

  extraItems.forEach((item) => {
    const key = item.name.trim().toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      return;
    }

    item.aliases.forEach((alias) => {
      if (alias && !existing.aliases.includes(alias)) {
        existing.aliases.push(alias);
      }
    });
  });

  return Array.from(map.values());
}

async function loadMockRecipes(): Promise<RecipeSeed[]> {
  const moduleUrl = new URL('../data/mockRecipes.ts', import.meta.url);
  const module = await import(moduleUrl.href);
  return module.mockRecipes as RecipeSeed[];
}

async function insertBatch(
  supabaseUrl: string,
  apiKey: string,
  batch: CanonicalItemInsert[],
  batchIndex: number,
  batchCount: number
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/canonical_items?on_conflict=name`,
    {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Batch ${batchIndex + 1}/${batchCount} failed: ${response.status} ${text}`);
  }

  console.log(`Seeded batch ${batchIndex + 1}/${batchCount} (${batch.length} canonical items)`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !apiKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const recipes = await loadMockRecipes();
  const rows = buildCanonicalItems(recipes);
  if (!rows.length) {
    console.log('No canonical items found to seed.');
    return;
  }

  const batches = chunk(rows, 50);
  for (let i = 0; i < batches.length; i += 1) {
    await insertBatch(supabaseUrl, apiKey, batches[i], i, batches.length);
  }

  console.log(`Seeding complete (${rows.length} canonical items).`);
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
