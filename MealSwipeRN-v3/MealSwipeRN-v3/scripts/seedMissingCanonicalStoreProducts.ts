import fs from 'fs';
import path from 'path';
import { packSizeHints } from '../data/packSizes.ts';

type UnitType = 'GRAM' | 'ML' | 'COUNT';

interface CanonicalItemRow {
  id: string;
  name: string;
  unit_type: UnitType;
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
  canonical_item_id: string;
}

const STORE_NAMES: Record<string, string> = {
  tesco: 'Tesco',
  sainsburys: "Sainsbury's",
  asda: 'ASDA',
  morrisons: 'Morrisons',
  waitrose: 'Waitrose',
};

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

function normalizeUnit(unit: string, value: number): { unit: UnitType; value: number } {
  const normalized = unit.trim().toLowerCase();
  if (['g', 'gram', 'grams'].includes(normalized)) return { unit: 'GRAM', value };
  if (normalized === 'kg') return { unit: 'GRAM', value: value * 1000 };
  if (['ml'].includes(normalized)) return { unit: 'ML', value };
  if (normalized === 'l') return { unit: 'ML', value: value * 1000 };
  if (normalized === 'tsp') return { unit: 'ML', value: value * 5 };
  if (normalized === 'tbsp') return { unit: 'ML', value: value * 15 };
  if (['piece', 'pieces', 'clove', 'cloves'].includes(normalized)) return { unit: 'COUNT', value };
  return { unit: 'COUNT', value };
}

function defaultPackSize(unitType: UnitType) {
  switch (unitType) {
    case 'GRAM':
      return { value: 100, unit: 'GRAM' as UnitType };
    case 'ML':
      return { value: 100, unit: 'ML' as UnitType };
    case 'COUNT':
    default:
      return { value: 1, unit: 'COUNT' as UnitType };
  }
}

function packLabel(value: number, unit: UnitType) {
  if (unit === 'GRAM') return `${value}g`;
  if (unit === 'ML') return `${value}ml`;
  if (unit === 'COUNT') return value === 1 ? '' : `${value} pack`;
  return '';
}

function buildTitle(store: string, canonicalName: string, packValue: number, packUnit: UnitType) {
  const storeName = STORE_NAMES[store] ?? store;
  const label = packLabel(packValue, packUnit);
  return `${storeName} ${canonicalName}${label ? ` ${label}` : ''}`.trim();
}

async function fetchCanonicalItems(supabaseUrl: string, apiKey: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/canonical_items?select=id,name,unit_type`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fetch canonical items failed: ${response.status} ${text}`);
  }

  return (await response.json()) as CanonicalItemRow[];
}

async function fetchMappings(supabaseUrl: string, apiKey: string) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/canonical_to_store_product?select=canonical_item_id,store_products(id,store)`,
    {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

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
    body: JSON.stringify(
      products.map(({ canonical_item_id, ...rest }) => rest)
    ),
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

function parseArgs() {
  const args = process.argv.slice(2);
  let stores: string[] = ['tesco', 'sainsburys', 'asda', 'morrisons', 'waitrose'];

  args.forEach((arg) => {
    if (arg.startsWith('--stores=')) {
      const value = arg.split('=')[1];
      stores = value.split(',').map((store) => store.trim()).filter(Boolean);
    }
  });

  return { stores };
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !apiKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const { stores } = parseArgs();
  const canonicalItems = await fetchCanonicalItems(supabaseUrl, apiKey);
  const mappings = await fetchMappings(supabaseUrl, apiKey);

  const existingMapping = new Set<string>();
  mappings.forEach((row) => {
    if (!row.store_products) return;
    existingMapping.add(`${row.canonical_item_id}:${row.store_products.store}`);
  });

  const productsToInsert: StoreProductSeed[] = [];

  canonicalItems.forEach((item) => {
    const hint = packSizeHints[item.name];
    let packValue: number;
    let packUnit: UnitType;

    if (hint) {
      const normalized = normalizeUnit(hint.unit, hint.packSize);
      if (normalized.unit === item.unit_type) {
        packValue = normalized.value;
        packUnit = normalized.unit;
      } else {
        const fallback = defaultPackSize(item.unit_type);
        packValue = fallback.value;
        packUnit = fallback.unit;
      }
    } else {
      const fallback = defaultPackSize(item.unit_type);
      packValue = fallback.value;
      packUnit = fallback.unit;
    }

    stores.forEach((store) => {
      const key = `${item.id}:${store}`;
      if (existingMapping.has(key)) return;

      productsToInsert.push({
        canonical_item_id: item.id,
        store,
        provider_product_id: `TODO_${store.toUpperCase()}_${item.id}`,
        title: buildTitle(store, item.name, packValue, packUnit),
        pack_size_value: packValue,
        pack_size_unit: packUnit,
        product_url: null,
        image_url: null,
      });
    });
  });

  if (!productsToInsert.length) {
    console.log('No missing canonical store_products found.');
    return;
  }

  const inserted = await insertStoreProducts(supabaseUrl, apiKey, productsToInsert);
  const mappingsToInsert = inserted.map((row, index) => ({
    canonical_item_id: productsToInsert[index].canonical_item_id,
    store_product_id: row.id,
    priority: 0,
    notes: 'Auto-seeded from canonical items.',
  }));

  await insertMappings(supabaseUrl, apiKey, mappingsToInsert);
  console.log(`Inserted ${inserted.length} store_products and mappings.`);
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
