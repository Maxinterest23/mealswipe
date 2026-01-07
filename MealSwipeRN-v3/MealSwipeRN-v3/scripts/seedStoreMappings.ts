import fs from 'fs';
import path from 'path';

interface CanonicalItemRow {
  id: string;
  name: string;
  aliases: string[] | null;
}

interface StoreProductSeed {
  store: string;
  provider_product_id: string;
  title: string;
  pack_size_value: number;
  pack_size_unit: 'GRAM' | 'ML' | 'COUNT';
  product_url?: string | null;
  image_url?: string | null;
  canonicalName: string;
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
  const response = await fetch(`${supabaseUrl}/rest/v1/canonical_items?select=id,name,aliases`, {
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
  const lookup = new Map<string, string>();

  rows.forEach((row) => {
    lookup.set(normalizeKey(row.name), row.id);
    (row.aliases ?? []).forEach((alias) => lookup.set(normalizeKey(alias), row.id));
  });

  return lookup;
}

function buildInList(values: string[]) {
  return `(${values.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')})`;
}

async function fetchExistingStoreProducts(
  supabaseUrl: string,
  apiKey: string,
  products: StoreProductSeed[]
): Promise<Map<string, { id: string }>> {
  const byStore = new Map<string, StoreProductSeed[]>();
  products.forEach((product) => {
    const list = byStore.get(product.store) ?? [];
    list.push(product);
    byStore.set(product.store, list);
  });

  const existing = new Map<string, { id: string }>();
  for (const [store, storeProducts] of byStore.entries()) {
    const ids = storeProducts.map((product) => product.provider_product_id);
    if (!ids.length) continue;

    const url = new URL(`${supabaseUrl}/rest/v1/store_products`);
    url.searchParams.set('select', 'id,store,provider_product_id');
    url.searchParams.set('store', `eq.${store}`);
    url.searchParams.set('provider_product_id', `in.${buildInList(ids)}`);

    const response = await fetch(url.toString(), {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Fetch store_products failed: ${response.status} ${text}`);
    }

    const rows = (await response.json()) as Array<{
      id: string;
      store: string;
      provider_product_id: string;
    }>;

    rows.forEach((row) => {
      existing.set(`${row.store}:${row.provider_product_id}`, { id: row.id });
    });
  }

  return existing;
}

async function insertStoreProducts(
  supabaseUrl: string,
  apiKey: string,
  products: StoreProductSeed[]
): Promise<Array<StoreProductSeed & { id: string }>> {
  if (!products.length) return [];

  const response = await fetch(`${supabaseUrl}/rest/v1/store_products`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(products.map(({ canonicalName, ...rest }) => rest)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Insert store_products failed: ${response.status} ${text}`);
  }

  const rows = (await response.json()) as Array<StoreProductSeed & { id: string }>;
  return rows.map((row, index) => ({ ...row, canonicalName: products[index].canonicalName }));
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

  const canonicalLookup = await fetchCanonicalItems(supabaseUrl, apiKey);

  const products: StoreProductSeed[] = [
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_SPAGHETTI',
      title: 'Tesco Spaghetti 500g',
      pack_size_value: 500,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'spaghetti',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_EGGS',
      title: 'Tesco Free Range Eggs 12 pack',
      pack_size_value: 12,
      pack_size_unit: 'COUNT',
      product_url: null,
      image_url: null,
      canonicalName: 'eggs',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_CHICKEN',
      title: 'Tesco Chicken Breast Fillets 600g',
      pack_size_value: 600,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'chicken',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_COCONUT_MILK',
      title: 'Tesco Coconut Milk 400ml',
      pack_size_value: 400,
      pack_size_unit: 'ML',
      product_url: null,
      image_url: null,
      canonicalName: 'coconut milk',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_RICE',
      title: 'Tesco Long Grain Rice 1kg',
      pack_size_value: 1000,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'rice',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_CHICKPEAS',
      title: 'Tesco Chickpeas 400g',
      pack_size_value: 400,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'chickpeas',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_TOMATOES',
      title: 'Tesco Cherry Tomatoes 250g',
      pack_size_value: 250,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'cherry tomatoes',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_CUCUMBER',
      title: 'Tesco Cucumber',
      pack_size_value: 1,
      pack_size_unit: 'COUNT',
      product_url: null,
      image_url: null,
      canonicalName: 'cucumber',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_ONION',
      title: 'Tesco Red Onions 1kg',
      pack_size_value: 1000,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'onion',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_OLIVE_OIL',
      title: 'Tesco Olive Oil 500ml',
      pack_size_value: 500,
      pack_size_unit: 'ML',
      product_url: null,
      image_url: null,
      canonicalName: 'olive oil',
    },
    {
      store: 'tesco',
      provider_product_id: 'TODO_TESCO_LEMON',
      title: 'Tesco Lemons 4 pack',
      pack_size_value: 4,
      pack_size_unit: 'COUNT',
      product_url: null,
      image_url: null,
      canonicalName: 'lemon',
    },
    {
      store: 'tesco',
      provider_product_id: 'https://www.tesco.com/groceries/en-GB/products/268768873',
      title: 'Cathedral City Mature Cheddar Cheese 350 G',
      pack_size_value: 350,
      pack_size_unit: 'GRAM',
      product_url: 'https://www.tesco.com/groceries/en-GB/products/268768873',
      image_url: 'https://digitalcontent.api.tesco.com/v2/media/ghs/020b73bb-fb75-45d6-aced-00bd39f357b1/7d8f014f-d9fa-4df0-92ab-922dea766b5e.jpeg?h=225&w=225',
      canonicalName: 'cheddar cheese',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_SPAGHETTI',
      title: 'Sainsbury\'s Spaghetti 500g',
      pack_size_value: 500,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'spaghetti',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_EGGS',
      title: 'Sainsbury\'s Eggs 12 pack',
      pack_size_value: 12,
      pack_size_unit: 'COUNT',
      product_url: null,
      image_url: null,
      canonicalName: 'eggs',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_CHICKEN',
      title: 'Sainsbury\'s Chicken Breast 600g',
      pack_size_value: 600,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'chicken',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_RICE',
      title: 'Sainsbury\'s Long Grain Rice 1kg',
      pack_size_value: 1000,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'rice',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_CHICKPEAS',
      title: 'Sainsbury\'s Chickpeas 400g',
      pack_size_value: 400,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'chickpeas',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_TOMATOES',
      title: 'Sainsbury\'s Cherry Tomatoes 250g',
      pack_size_value: 250,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'cherry tomatoes',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_CUCUMBER',
      title: 'Sainsbury\'s Cucumber',
      pack_size_value: 1,
      pack_size_unit: 'COUNT',
      product_url: null,
      image_url: null,
      canonicalName: 'cucumber',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_ONION',
      title: 'Sainsbury\'s Red Onions 1kg',
      pack_size_value: 1000,
      pack_size_unit: 'GRAM',
      product_url: null,
      image_url: null,
      canonicalName: 'onion',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_OLIVE_OIL',
      title: 'Sainsbury\'s Olive Oil 500ml',
      pack_size_value: 500,
      pack_size_unit: 'ML',
      product_url: null,
      image_url: null,
      canonicalName: 'olive oil',
    },
    {
      store: 'sainsburys',
      provider_product_id: 'TODO_SAINSBURYS_LEMON',
      title: 'Sainsbury\'s Lemons 4 pack',
      pack_size_value: 4,
      pack_size_unit: 'COUNT',
      product_url: null,
      image_url: null,
      canonicalName: 'lemon',
    },
    {
      store: 'asda',
      provider_product_id: 'https://www.asda.com/groceries/product/mature-cheese/cathedral-city-our-mature-cheddar-cheese-350g/3658568',
      title: 'Cathedral City Our Mature Cheddar Cheese 350g',
      pack_size_value: 350,
      pack_size_unit: 'GRAM',
      product_url: 'https://www.asda.com/groceries/product/mature-cheese/cathedral-city-our-mature-cheddar-cheese-350g/3658568',
      image_url: 'https://asdagroceries.scene7.com/is/image/asdagroceries/5000295142893_T1',
      canonicalName: 'cheddar cheese',
    },
    {
      store: 'morrisons',
      provider_product_id: 'https://groceries.morrisons.com/products/cathedral-city-extra-mature-cheddar-cheese-350g/103128171',
      title: 'Cathedral City Extra Mature Cheddar Cheese 350g',
      pack_size_value: 350,
      pack_size_unit: 'GRAM',
      product_url: 'https://groceries.morrisons.com/products/cathedral-city-extra-mature-cheddar-cheese-350g/103128171',
      image_url: 'https://groceries.morrisons.com/images-v3/4b85987b-1398-4173-a0c1-3546047c9d74/074d520d-4106-4369-b06c-2e50d4f36c31/1280x1280.webp',
      canonicalName: 'cheddar cheese',
    },
  ];

  const existingProducts = await fetchExistingStoreProducts(supabaseUrl, apiKey, products);
  const productsToInsert = products.filter(
    (product) => !existingProducts.has(`${product.store}:${product.provider_product_id}`)
  );
  const insertedProducts = await insertStoreProducts(supabaseUrl, apiKey, productsToInsert);
  const allProducts = products.map((product) => {
    const existing = existingProducts.get(`${product.store}:${product.provider_product_id}`);
    const inserted = insertedProducts.find(
      (row) => row.store === product.store && row.provider_product_id === product.provider_product_id
    );
    if (existing) return { ...product, id: existing.id };
    if (inserted) return inserted;
    throw new Error(`Missing store_product row for ${product.store}:${product.provider_product_id}`);
  });

  const mappings = allProducts.map((product) => {
    const canonicalId = canonicalLookup.get(normalizeKey(product.canonicalName));
    if (!canonicalId) {
      throw new Error(`Missing canonical item for ${product.canonicalName}. Run seedCanonicalItems first.`);
    }
    return {
      canonical_item_id: canonicalId,
      store_product_id: product.id,
      priority: 0,
      notes: 'TODO: replace provider_product_id once provider search is wired.',
    };
  });

  await insertMappings(supabaseUrl, apiKey, mappings);

  const skipped = products.length - insertedProducts.length;
  console.log(`Seeded ${insertedProducts.length} store products; reused ${skipped} existing; ensured mappings.`);
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
