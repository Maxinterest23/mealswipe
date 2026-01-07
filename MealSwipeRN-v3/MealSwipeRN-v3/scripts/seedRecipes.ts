import fs from 'fs';
import path from 'path';

interface PublishedRecipeInsert {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  icon: string | null;
  image_gradient: string | null;
  servings: number | null;
  prep_min: number | null;
  cook_min: number | null;
  rest_min: number | null;
  total_min: number | null;
  difficulty: string | null;
  cost_tier: number | null;
  dietary_tags: string[] | null;
  ingredients: unknown[];
  steps: string[];
  nutrition: Record<string, unknown> | null;
  tips: string[] | null;
  substitutions: string[] | null;
}

interface RecipeSeed {
  id: string;
  name: string;
  tips?: string[] | null;
  icon?: string | null;
  imageGradient?: string | null;
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  costTier?: number | null;
  badges?: string[] | null;
  ingredients?: unknown[];
  methodSteps?: string[];
  nutrition?: Record<string, unknown> | null;
  substitutions?: string[] | null;
}

const DEFAULT_BATCH_SIZE = 25;

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

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function mapRecipeToInsert(recipes: RecipeSeed[]): PublishedRecipeInsert[] {
  return recipes.map((recipe) => ({
    id: recipe.id,
    title: recipe.name,
    description: recipe.tips?.[0] ?? null,
    image_url: null,
    icon: recipe.icon ?? null,
    image_gradient: recipe.imageGradient ?? null,
    servings: recipe.servings ?? null,
    prep_min: recipe.prepTimeMinutes ?? null,
    cook_min: recipe.cookTimeMinutes ?? null,
    rest_min: 0,
    total_min: (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0),
    difficulty: null,
    cost_tier: recipe.costTier ?? null,
    dietary_tags: recipe.badges ?? [],
    ingredients: recipe.ingredients ?? [],
    steps: recipe.methodSteps ?? [],
    nutrition: recipe.nutrition ?? null,
    tips: recipe.tips ?? null,
    substitutions: recipe.substitutions ?? null,
  }));
}

async function insertBatch(
  supabaseUrl: string,
  apiKey: string,
  batch: PublishedRecipeInsert[],
  batchIndex: number,
  batchCount: number
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/recipes_published?on_conflict=id`,
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

  console.log(`Seeded batch ${batchIndex + 1}/${batchCount} (${batch.length} recipes)`);
}

async function main() {
  loadDotEnv();

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !apiKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const recipesModule = await import(new URL('../data/mockRecipes.ts', import.meta.url).href);
  const recipes = recipesModule.mockRecipes as RecipeSeed[];
  const rows = mapRecipeToInsert(recipes);
  if (rows.length === 0) {
    console.log('No recipes found to seed.');
    return;
  }

  const batches = chunk(rows, DEFAULT_BATCH_SIZE);
  for (let i = 0; i < batches.length; i += 1) {
    await insertBatch(supabaseUrl, apiKey, batches[i], i, batches.length);
  }

  console.log('Seeding complete.');
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
