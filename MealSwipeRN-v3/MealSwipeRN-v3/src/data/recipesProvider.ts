import { mockRecipes } from '@/data/recipes';
import { Recipe, Ingredient, Nutrition } from '@/types';
import { fetchFeed, RemoteRecipeRow, FeedPage } from '@/src/api/client';
import { cacheRecipes } from '@/src/data/recipeCache';

const DEFAULT_PAGE_SIZE = 10;

const FALLBACK_GRADIENTS = mockRecipes.map((recipe) => recipe.imageGradient);
const FALLBACK_ICONS = mockRecipes.map((recipe) => recipe.icon);

const DEFAULT_NUTRITION: Nutrition = {
  calories: 0,
  protein: 0,
  carbohydrates: 0,
  fat: 0,
};

interface ProviderCursor {
  source: 'local' | 'remote';
  value: string;
}

interface RemoteCursor {
  created_at: string;
  id: string;
}

function encodeProviderCursor(cursor: ProviderCursor): string {
  return JSON.stringify(cursor);
}

function decodeProviderCursor(value?: string | null): ProviderCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ProviderCursor;
    if ((parsed?.source === 'local' || parsed?.source === 'remote') && typeof parsed.value === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function parseRemoteCursor(value?: string | null): RemoteCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as RemoteCursor;
    if (!parsed?.created_at || !parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseLocalIndex(value?: string | null): string | null {
  if (!value) return null;
  const index = Number.parseInt(value, 10);
  if (!Number.isFinite(index) || index < 0) return null;
  return String(index);
}

function getLocalCursorFromRemoteCursor(value?: string | null): string | null {
  const parsed = parseRemoteCursor(value);
  if (!parsed) return null;
  const index = mockRecipes.findIndex((recipe) => recipe.id === parsed.id);
  if (index === -1) return null;
  return String(index + 1);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickFromList(list: string[], seed: string, fallback: string): string {
  if (!list.length) return fallback;
  return list[hashString(seed) % list.length];
}

function normalizeCostTier(value?: number | null): Recipe['costTier'] {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return 2;
}

function mapRemoteRecipe(row: RemoteRecipeRow): Recipe {
  const prepMinutes = row.prep_min ?? 0;
  const cookMinutes = row.cook_min ?? Math.max((row.total_min ?? 0) - prepMinutes, 0);

  return {
    id: row.id,
    name: row.title,
    description: row.description ?? undefined,
    imageUrl: row.image_url ?? undefined,
    imageGradient: row.image_gradient ?? pickFromList(FALLBACK_GRADIENTS, row.id, 'linear-gradient(135deg, #FF6B35 0%, #ff8a5c 100%)'),
    icon: row.icon ?? pickFromList(FALLBACK_ICONS, row.id, '?'),
    prepTimeMinutes: prepMinutes,
    cookTimeMinutes: cookMinutes,
    servings: row.servings ?? 2,
    costTier: normalizeCostTier(row.cost_tier),
    badges: row.dietary_tags ?? [],
    ingredients: (row.ingredients ?? []) as Ingredient[],
    nutrition: (row.nutrition ?? DEFAULT_NUTRITION) as Nutrition,
    methodSteps: row.steps ?? [],
    tips: row.tips ?? undefined,
    substitutions: row.substitutions ?? undefined,
  };
}

function shouldUseRemoteFeed(): boolean {
  const flag = process.env.EXPO_PUBLIC_USE_REMOTE_FEED;
  const hasConfig = Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );

  if (flag === 'false' || flag === '0') return false;
  if (flag === 'true' || flag === '1') return hasConfig;
  return hasConfig;
}

function getLocalFeedPage(cursor?: string | null, limit = DEFAULT_PAGE_SIZE): FeedPage<Recipe> {
  const startIndex = cursor ? Number.parseInt(cursor, 10) : 0;
  const safeStart = Number.isFinite(startIndex) && startIndex >= 0 ? startIndex : 0;
  const items = mockRecipes.slice(safeStart, safeStart + limit);
  const nextIndex = safeStart + items.length;

  return {
    items,
    nextCursor: nextIndex < mockRecipes.length ? String(nextIndex) : null,
  };
}

export async function getFeedPage(
  cursor?: string | null,
  limit = DEFAULT_PAGE_SIZE
): Promise<FeedPage<Recipe>> {
  const decodedCursor = decodeProviderCursor(cursor);
  const remoteCursor = decodedCursor?.source === 'remote' ? decodedCursor.value : cursor;
  const localCursor =
    decodedCursor?.source === 'local'
      ? decodedCursor.value
      : parseLocalIndex(cursor) ?? getLocalCursorFromRemoteCursor(remoteCursor);

  if (!shouldUseRemoteFeed() || decodedCursor?.source === 'local') {
    const page = getLocalFeedPage(localCursor, limit);
    cacheRecipes(page.items);
    return {
      items: page.items,
      nextCursor: page.nextCursor ? encodeProviderCursor({ source: 'local', value: page.nextCursor }) : null,
    };
  }

  try {
    const { items, nextCursor } = await fetchFeed({ cursor: remoteCursor, limit });
    const mapped = items.map(mapRemoteRecipe);
    cacheRecipes(mapped);
    return {
      items: mapped,
      nextCursor: nextCursor ? encodeProviderCursor({ source: 'remote', value: nextCursor }) : null,
    };
  } catch (error) {
    console.warn('Remote feed fetch failed, falling back to local data.', error);
    const page = getLocalFeedPage(localCursor, limit);
    cacheRecipes(page.items);
    return {
      items: page.items,
      nextCursor: page.nextCursor ? encodeProviderCursor({ source: 'local', value: page.nextCursor }) : null,
    };
  }
}
