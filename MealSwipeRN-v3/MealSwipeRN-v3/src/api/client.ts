export interface RemoteRecipeRow {
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
  ingredients: unknown[] | null;
  steps: string[] | null;
  nutrition: Record<string, unknown> | null;
  tips: string[] | null;
  substitutions: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface FetchFeedOptions {
  cursor?: string | null;
  limit?: number;
}

export interface FeedPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface FeedCursor {
  created_at: string;
  id: string;
}

const DEFAULT_LIMIT = 10;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function encodeCursor(cursor: FeedCursor): string {
  return JSON.stringify(cursor);
}

function decodeCursor(value?: string | null): FeedCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as FeedCursor;
    if (!parsed?.created_at || !parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildCursorFilter(cursor: FeedCursor): string {
  return `(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id}))`;
}

export async function fetchFeed({ cursor, limit = DEFAULT_LIMIT }: FetchFeedOptions): Promise<FeedPage<RemoteRecipeRow>> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase env is missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  const selectFields = [
    'id',
    'title',
    'description',
    'image_url',
    'icon',
    'image_gradient',
    'servings',
    'prep_min',
    'cook_min',
    'rest_min',
    'total_min',
    'difficulty',
    'cost_tier',
    'dietary_tags',
    'ingredients',
    'steps',
    'nutrition',
    'tips',
    'substitutions',
    'created_at',
    'updated_at',
  ].join(',');

  const queryParts = [
    `select=${encodeURIComponent(selectFields)}`,
    `order=${encodeURIComponent('created_at.desc,id.desc')}`,
    `limit=${limit}`,
  ];

  const decodedCursor = decodeCursor(cursor);
  if (decodedCursor) {
    queryParts.push(`or=${encodeURIComponent(buildCursorFilter(decodedCursor))}`);
  }

  const url = `${SUPABASE_URL}/rest/v1/recipes_published?${queryParts.join('&')}`;

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fetch failed: ${response.status} ${text}`);
  }

  const items = (await response.json()) as RemoteRecipeRow[];
  const lastItem = items[items.length - 1];

  return {
    items,
    nextCursor: lastItem ? encodeCursor({ created_at: lastItem.created_at, id: lastItem.id }) : null,
  };
}
