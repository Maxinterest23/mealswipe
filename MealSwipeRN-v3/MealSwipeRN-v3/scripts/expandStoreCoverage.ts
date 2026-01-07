import fs from 'fs';
import path from 'path';

type UnitType = 'GRAM' | 'ML' | 'COUNT';

interface BaseProductRow {
  canonical_item_id: string;
  store_products: {
    id: string;
    store: string;
    title: string;
    pack_size_value: number;
    pack_size_unit: UnitType;
  } | null;
}

interface MappingRow {
  canonical_item_id: string;
  store_products: {
    id: string;
    store: string;
  } | null;
}

interface StoreProductSeed {
  store: string;
  provider_product_id: string;
  title: string;
  pack_size_value: number;
  pack_size_unit: UnitType;
  product_url: string | null;
  image_url: string | null;
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

function normalizeTitle(title: string) {
  return title
    .replace(/^tesco\s+/i, '')
    .replace(/^sainsbury'?s\s+/i, '')
    .replace(/^asda\s+/i, '')
    .replace(/^morrisons\s+/i, '')
    .replace(/^waitrose\s+/i, '')
    .trim();
}

function displayNameForStore(store: string) {
  switch (store) {
    case 'sainsburys':
      return 'Sainsbury\'s';
    case 'asda':
      return 'ASDA';
    case 'morrisons':
      return 'Morrisons';
    case 'waitrose':
      return 'Waitrose';
    default:
      return store.charAt(0).toUpperCase() + store.slice(1);
  }
}

function buildTitle(store: string, baseTitle: string) {
  const cleaned = normalizeTitle(baseTitle);
  return `${displayNameForStore(store)} ${cleaned}`.trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let baseStore = 'tesco';
  let stores: string[] = ['sainsburys', 'asda', 'morrisons', 'waitrose'];

  args.forEach((arg) => {
    if (arg.startsWith('--base=')) {
      baseStore = arg.split('=')[1];
    } else if (arg.startsWith('--stores=')) {
      const value = arg.split('=')[1];
      stores = value.split(',').map((store) => store.trim()).filter(Boolean);
    }
  });

  return { baseStore, stores };
}

async function fetchBaseProducts(supabaseUrl: string, apiKey: string, baseStore: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/canonical_to_store_product`);
  url.searchParams.set('select', 'canonical_item_id,store_products(id,store,title,pack_size_value,pack_size_unit)');
  url.searchParams.set('store_products.store', `eq.${baseStore}`);

  const response = await fetch(url.toString(), {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fetch base products failed: ${response.status} ${text}`);
  }

  return (await response.json()) as BaseProductRow[];
}

async function fetchAllMappings(supabaseUrl: string, apiKey: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/canonical_to_store_product`);
  url.searchParams.set('select', 'canonical_item_id,store_products(id,store)');

  const response = await fetch(url.toString(), {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fetch mappings failed: ${response.status} ${text}`);
  }

  return (await response.json()) as MappingRow[];
}

async function insertStoreProducts(
  supabaseUrl: string,
  apiKey: string,
  products: StoreProductSeed[]
) {
  if (!products.length) return [] as Array<StoreProductSeed & { id: string }>;

  const response = await fetch(`${supabaseUrl}/rest/v1/store_products`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(products),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Insert store_products failed: ${response.status} ${text}`);
  }

  return (await response.json()) as Array<StoreProductSeed & { id: string }>;
}

async function insertMappings(
  supabaseUrl: string,
  apiKey: string,
  mappings: Array<{ canonical_item_id: string; store_product_id: string; priority: number; notes?: string | null }>
) {
  if (!mappings.length) return;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/canonical_to_store_product?on_conflict=canonical_item_id,store_product_id`,
    {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(mappings),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Insert mappings failed: ${response.status} ${text}`);
  }
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !apiKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const { baseStore, stores } = parseArgs();
  const baseRows = await fetchBaseProducts(supabaseUrl, apiKey, baseStore);
  const baseProducts = baseRows
    .filter((row) => row.store_products)
    .map((row) => ({
      canonical_item_id: row.canonical_item_id,
      store_product: row.store_products!,
    }));

  const mappings = await fetchAllMappings(supabaseUrl, apiKey);
  const existingMapping = new Set<string>();
  mappings.forEach((row) => {
    if (!row.store_products) return;
    existingMapping.add(`${row.canonical_item_id}:${row.store_products.store}`);
  });

  const productsToInsert: Array<StoreProductSeed & { canonical_item_id: string }> = [];

  baseProducts.forEach(({ canonical_item_id, store_product }) => {
    stores.forEach((store) => {
      if (store === baseStore) return;
      const key = `${canonical_item_id}:${store}`;
      if (existingMapping.has(key)) return;

      productsToInsert.push({
        canonical_item_id,
        store,
        provider_product_id: `TODO_${store.toUpperCase()}_${canonical_item_id}`,
        title: buildTitle(store, store_product.title),
        pack_size_value: Number(store_product.pack_size_value),
        pack_size_unit: store_product.pack_size_unit,
        product_url: null,
        image_url: null,
      });
    });
  });

  if (!productsToInsert.length) {
    console.log('No missing store coverage found.');
    return;
  }

  const inserted = await insertStoreProducts(
    supabaseUrl,
    apiKey,
    productsToInsert.map(({ canonical_item_id, ...rest }) => rest)
  );

  const mappingsToInsert = inserted.map((row, index) => ({
    canonical_item_id: productsToInsert[index].canonical_item_id,
    store_product_id: row.id,
    priority: 0,
    notes: 'Auto-seeded for coverage expansion.',
  }));

  await insertMappings(supabaseUrl, apiKey, mappingsToInsert);
  console.log(`Inserted ${inserted.length} store_products and mappings.`);
}

main().catch((error) => {
  console.error('Expansion failed:', error);
  process.exit(1);
});
