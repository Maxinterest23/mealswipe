import fs from 'fs';
import path from 'path';

interface StoreProductRow {
  id: string;
  store: string;
  provider_product_id: string;
  title: string;
  active: boolean;
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

async function fetchStoreProducts(supabaseUrl: string, apiKey: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/store_products`);
  url.searchParams.set('select', 'id,store,provider_product_id,title,active');
  url.searchParams.set('order', 'store.asc,provider_product_id.asc');

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

  return (await response.json()) as StoreProductRow[];
}

function groupByStore(rows: StoreProductRow[]) {
  const grouped = new Map<string, StoreProductRow[]>();
  rows.forEach((row) => {
    const list = grouped.get(row.store) ?? [];
    list.push(row);
    grouped.set(row.store, list);
  });
  return grouped;
}

function findDuplicates(rows: StoreProductRow[]) {
  const map = new Map<string, StoreProductRow[]>();
  rows.forEach((row) => {
    const key = `${row.store}:${row.provider_product_id}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  });

  return Array.from(map.entries())
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, list }));
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !apiKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const rows = await fetchStoreProducts(supabaseUrl, apiKey);

  const todoRows = rows.filter((row) => row.provider_product_id.startsWith('TODO_'));
  const groupedTodos = groupByStore(todoRows);

  console.log('TODO provider_product_id entries:');
  if (!todoRows.length) {
    console.log('- None');
  } else {
    groupedTodos.forEach((list, store) => {
      console.log(`- ${store}: ${list.length}`);
      list.forEach((row) => {
        console.log(`  - ${row.title} (${row.provider_product_id})`);
      });
    });
  }

  const duplicates = findDuplicates(rows);
  console.log('\nDuplicate store_products (same store + provider_product_id):');
  if (!duplicates.length) {
    console.log('- None');
  } else {
    duplicates.forEach((dup) => {
      console.log(`- ${dup.key}`);
      dup.list.forEach((row) => {
        console.log(`  - ${row.id} | ${row.title}`);
      });
    });
  }
}

main().catch((error) => {
  console.error('Report failed:', error);
  process.exit(1);
});
