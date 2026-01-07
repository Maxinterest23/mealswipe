import fs from 'fs';
import path from 'path';

interface CsvRow {
  id: string;
  store: string;
  title: string;
  provider_product_id: string;
  new_provider_product_id: string;
  product_url: string;
  image_url: string;
}

interface UpdateRow {
  id: string;
  provider_product_id: string;
  product_url: string | null;
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

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current);
  return result.map((value) => value.trim());
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = values[index] ?? '';
    });
    rows.push(row as CsvRow);
  }
  return rows;
}

async function fetchExistingById(supabaseUrl: string, apiKey: string, ids: string[]) {
  const url = new URL(`${supabaseUrl}/rest/v1/store_products`);
  url.searchParams.set('select', 'id,provider_product_id,product_url');
  url.searchParams.set('id', `in.(${ids.map((id) => `"${id.replace(/"/g, '""')}"`).join(',')})`);

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

  const rows = (await response.json()) as Array<{ id: string; provider_product_id: string; product_url: string | null }>;
  const map = new Map<string, { provider_product_id: string; product_url: string | null }>();
  rows.forEach((row) => map.set(row.id, row));
  return map;
}

async function updateStoreProducts(supabaseUrl: string, apiKey: string, updates: UpdateRow[]) {
  if (!updates.length) return;

  for (const update of updates) {
    const url = new URL(`${supabaseUrl}/rest/v1/store_products`);
    url.searchParams.set('id', `eq.${update.id}`);

    const response = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        provider_product_id: update.provider_product_id,
        product_url: update.product_url,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Update store_products failed: ${response.status} ${text}`);
    }
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

  const csvPath = path.join(process.cwd(), 'scripts', 'todoStoreProducts.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Missing CSV at ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(content);

  const updates: UpdateRow[] = [];
  rows.forEach((row) => {
    if (!row.new_provider_product_id) return;
    updates.push({
      id: row.id,
      provider_product_id: row.new_provider_product_id,
      product_url: row.new_provider_product_id,
    });
  });

  if (!updates.length) {
    console.log('No updates found. Fill new_provider_product_id in scripts/todoStoreProducts.csv');
    return;
  }

  const existing = await fetchExistingById(supabaseUrl, apiKey, updates.map((row) => row.id));
  const filteredUpdates = updates.filter((update) => {
    const current = existing.get(update.id);
    if (!current) return true;
    return current.provider_product_id !== update.provider_product_id;
  });

  if (!filteredUpdates.length) {
    console.log('All rows are already up to date.');
    return;
  }

  await updateStoreProducts(supabaseUrl, apiKey, filteredUpdates);
  console.log(`Updated ${filteredUpdates.length} store_products.`);
}

main().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
