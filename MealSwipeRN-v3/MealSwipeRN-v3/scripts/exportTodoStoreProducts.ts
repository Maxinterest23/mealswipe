import fs from 'fs';
import path from 'path';

interface StoreProductRow {
  id: string;
  store: string;
  provider_product_id: string;
  title: string;
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

function csvEscape(value: string | null | undefined) {
  const text = value ?? '';
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function fetchStoreProducts(supabaseUrl: string, apiKey: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/store_products`);
  url.searchParams.set('select', 'id,store,provider_product_id,title,product_url,image_url');
  url.searchParams.set('order', 'store.asc,title.asc');

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

function parseArgs() {
  const args = process.argv.slice(2);
  let includeSearch = false;

  args.forEach((arg) => {
    if (arg === '--include-search') {
      includeSearch = true;
    }
  });

  return { includeSearch };
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !apiKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const { includeSearch } = parseArgs();
  const rows = await fetchStoreProducts(supabaseUrl, apiKey);
  const filtered = rows.filter((row) => {
    if (row.provider_product_id.startsWith('TODO_')) return true;
    if (includeSearch && row.provider_product_id.includes('/search?query=')) return true;
    return false;
  });
  if (!filtered.length) {
    console.log('No TODO/search store_products found.');
    return;
  }

  const header = [
    'id',
    'store',
    'title',
    'provider_product_id',
    'new_provider_product_id',
    'product_url',
    'image_url',
  ];

  const lines = [header.join(',')];
  filtered.forEach((row) => {
    lines.push(
      [
        csvEscape(row.id),
        csvEscape(row.store),
        csvEscape(row.title),
        csvEscape(row.provider_product_id),
        '',
        csvEscape(row.product_url),
        csvEscape(row.image_url),
      ].join(',')
    );
  });

  const output = lines.join('\n');
  const outputPath = path.join(process.cwd(), 'scripts', 'todoStoreProducts.csv');
  fs.writeFileSync(outputPath, `${output}\n`, 'utf8');
  console.log(`Wrote ${filtered.length} rows to ${outputPath}`);
}

main().catch((error) => {
  console.error('Export failed:', error);
  process.exit(1);
});
