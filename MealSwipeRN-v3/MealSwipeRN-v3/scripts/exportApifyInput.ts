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

function normalizeProviderId(value: string) {
  return value.trim();
}

async function fetchStoreProducts(supabaseUrl: string, apiKey: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/store_products`);
  url.searchParams.set('select', 'id,store,provider_product_id,title,active');
  url.searchParams.set('active', 'eq.true');

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

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const stores: string[] = [];
  let batchSize = 25;

  args.forEach((arg) => {
    if (arg.startsWith('--stores=')) {
      const value = arg.split('=')[1];
      stores.push(...value.split(',').map((store) => store.trim()).filter(Boolean));
    } else if (arg.startsWith('--batch=')) {
      batchSize = Number(arg.split('=')[1]);
    }
  });

  return { stores, batchSize };
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const { stores, batchSize } = parseArgs();
  const rows = await fetchStoreProducts(supabaseUrl, supabaseKey);
  const filtered = rows.filter((row) => {
    if (row.provider_product_id.startsWith('TODO_')) return false;
    if (!stores.length) return true;
    return stores.includes(row.store);
  });

  const urls = Array.from(new Set(filtered.map((row) => normalizeProviderId(row.provider_product_id)))).filter(Boolean);
  if (!urls.length) {
    console.log('No provider URLs found.');
    return;
  }

  const batches = chunk(urls, batchSize);
  const outputDir = path.join(process.cwd(), 'scripts', 'apify-input');
  fs.mkdirSync(outputDir, { recursive: true });

  batches.forEach((batch, index) => {
    const payload = {
      detailsUrls: batch.map((url) => ({ url })),
      additionalProperties: true,
      additionalReviewProperties: false,
      scrapeInfluencerProducts: false,
    };
    const outputPath = path.join(outputDir, `apify-input-${index + 1}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  });

  console.log(`Wrote ${batches.length} Apify input files to ${outputDir}`);
}

main().catch((error) => {
  console.error('Export failed:', error);
  process.exit(1);
});
