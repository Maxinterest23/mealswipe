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

interface SearchResult {
  searchQuery?: { term?: string };
  organicResults?: Array<{ url?: string }>;
}

interface StoreSearchResult {
  rowId: string;
  url: string | null;
}

const STORE_PATTERNS: Record<string, RegExp> = {
  tesco: /tesco\.com\/groceries\/en-GB\/products\//,
  sainsburys: /sainsburys\.co\.uk\/gol-ui\/product\//,
  asda: /asda\.com\/groceries\/product\//,
  morrisons: /groceries\.morrisons\.com\/products\//,
  waitrose: /waitrose\.com\/ecom\/products\//,
};

const STORE_DOMAINS: Record<string, string> = {
  tesco: 'tesco.com/groceries/en-GB/products',
  sainsburys: 'sainsburys.co.uk/gol-ui/product',
  asda: 'asda.com/groceries/product',
  morrisons: 'groceries.morrisons.com/products',
  waitrose: 'waitrose.com/ecom/products',
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

function csvEscape(value: string | null | undefined) {
  const text = value ?? '';
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function isProductUrl(store: string, url: string) {
  const pattern = STORE_PATTERNS[store];
  if (!pattern) return false;
  return pattern.test(url);
}

function normalizeTitle(title: string) {
  let cleaned = title.toLowerCase();
  cleaned = cleaned.replace(/^tesco\s+/, '');
  cleaned = cleaned.replace(/^sainsbury'?s\s+/, '');
  cleaned = cleaned.replace(/^asda\s+/, '');
  cleaned = cleaned.replace(/^morrisons\s+/, '');
  cleaned = cleaned.replace(/^waitrose\s+/, '');
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function buildQuery(store: string, title: string) {
  const domain = STORE_DOMAINS[store];
  if (!domain) return null;
  const cleaned = normalizeTitle(title);
  return `site:${domain} ${cleaned}`.trim();
}

function buildFallbackQuery(store: string, title: string) {
  const domain = STORE_DOMAINS[store];
  if (!domain) return null;
  let cleaned = normalizeTitle(title);
  cleaned = cleaned.replace(/\b\d+(\.\d+)?\b/g, ' ');
  cleaned = cleaned.replace(/\b(kg|g|gram|grams|ml|l|litre|litres|pack|packs|x|pcs|pc|count|each|large|medium|small)\b/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return `site:${domain} ${cleaned}`.trim();
}

function buildStoreSearchTerm(title: string, useFallback: boolean) {
  let cleaned = normalizeTitle(title);
  if (!cleaned) return null;
  if (!useFallback) return cleaned;

  cleaned = cleaned.replace(/\b\d+(\.\d+)?\b/g, ' ');
  cleaned = cleaned.replace(/\b(kg|g|gram|grams|ml|l|litre|litres|pack|packs|x|pcs|pc|count|each|large|medium|small)\b/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function buildStoreSearchUrl(store: string, term: string) {
  if (store === 'tesco') {
    return `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(term)}`;
  }
  if (store === 'waitrose') {
    return `https://www.waitrose.com/ecom/shop/search?searchTerm=${encodeURIComponent(term)}`;
  }
  return null;
}

function toJinaUrl(targetUrl: string) {
  const cleaned = targetUrl.replace(/^https?:\/\//, '');
  return `https://r.jina.ai/http://${cleaned}`;
}

function extractUrlsFromText(text: string, pattern: RegExp) {
  const urls = new Set<string>();
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[0]) urls.add(match[0]);
  }

  return Array.from(urls);
}

function extractStoreUrls(store: string, text: string) {
  if (store === 'tesco') {
    return extractUrlsFromText(text, /https?:\/\/www\.tesco\.com\/groceries\/en-GB\/products\/\d+/i);
  }
  if (store === 'waitrose') {
    const fullUrls = extractUrlsFromText(
      text,
      /https?:\/\/www\.waitrose\.com\/ecom\/products\/[a-z0-9-]+\/[0-9-]+/i
    );
    if (fullUrls.length) return fullUrls;

    const pathMatches = extractUrlsFromText(text, /\/ecom\/products\/[a-z0-9-]+\/[0-9-]+/i);
    return pathMatches.map((path) => `https://www.waitrose.com${path}`);
  }
  return [];
}

async function runStoreSearchFallback(rows: StoreProductRow[]) {
  const results: StoreSearchResult[] = [];

  for (const row of rows) {
    const primaryTerm = buildStoreSearchTerm(row.title, false);
    if (!primaryTerm) {
      results.push({ rowId: row.id, url: null });
      continue;
    }

    const searchUrl = buildStoreSearchUrl(row.store, primaryTerm);
    if (!searchUrl) {
      results.push({ rowId: row.id, url: null });
      continue;
    }

    const urls: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(toJinaUrl(searchUrl));
      if (response.ok) {
        const text = await response.text();
        urls.push(...extractStoreUrls(row.store, text));
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!urls.length) {
      const fallbackTerm = buildStoreSearchTerm(row.title, true);
      if (fallbackTerm) {
        const fallbackUrl = buildStoreSearchUrl(row.store, fallbackTerm);
        if (fallbackUrl) {
          const fallbackResponse = await fetch(toJinaUrl(fallbackUrl));
          if (fallbackResponse.ok) {
            const fallbackText = await fallbackResponse.text();
            urls.push(...extractStoreUrls(row.store, fallbackText));
          }
        }
      }
    }

    const picked = urls.find((url) => isProductUrl(row.store, url)) ?? null;
    results.push({ rowId: row.id, url: picked });
  }

  return results;
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

async function runSearchQueries(apiKey: string, queries: string[]) {
  if (!queries.length) return [] as SearchResult[];

  const response = await fetch(
    `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        queries: queries.join('\n'),
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
        countryCode: 'gb',
        languageCode: 'en',
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Search actor failed: ${response.status} ${text}`);
  }

  return (await response.json()) as SearchResult[];
}

function pickUrl(store: string, result: SearchResult) {
  const pattern = STORE_PATTERNS[store];
  if (!pattern) return null;
  const organic = result.organicResults ?? [];
  const match = organic.find((item) => item.url && pattern.test(item.url));
  return match?.url ?? null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let apply = false;
  let secondPass = false;
  let storeSearchOnly = false;
  let todoOnly = false;

  args.forEach((arg) => {
    if (arg === '--apply') apply = true;
    if (arg === '--second-pass') secondPass = true;
    if (arg === '--store-search-only') storeSearchOnly = true;
    if (arg === '--todo-only') todoOnly = true;
  });

  return { apply, secondPass, storeSearchOnly, todoOnly };
}

async function updateStoreProducts(
  supabaseUrl: string,
  apiKey: string,
  updates: Array<{ id: string; provider_product_id: string; product_url: string }>
) {
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
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apifyKey = process.env.PROVIDER_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  if (!apifyKey) {
    console.error('Missing PROVIDER_API_KEY (Apify token).');
    process.exit(1);
  }

  const { apply, secondPass, storeSearchOnly, todoOnly } = parseArgs();
  const rows = await fetchStoreProducts(supabaseUrl, supabaseKey);

  const rowsNeeding = rows.filter((row) => {
    const pattern = STORE_PATTERNS[row.store];
    if (!pattern) return false;
    if (todoOnly) {
      return row.provider_product_id.startsWith('TODO_');
    }
    return !isProductUrl(row.store, row.provider_product_id);
  });

  const newUrlById = new Map<string, string>();
  const queryByRowId = new Map<string, string>();
  const queries: string[] = [];
  rowsNeeding.forEach((row) => {
    const query = buildQuery(row.store, row.title);
    if (!query) return;
    queryByRowId.set(row.id, query);
    queries.push(query);
  });

  const resultByQuery = new Map<string, SearchResult>();

  if (!storeSearchOnly && queries.length) {
    const results = await runSearchQueries(apifyKey, queries);
    results.forEach((result) => {
      const term = result.searchQuery?.term;
      if (term) {
        resultByQuery.set(term, result);
      }
    });
  }
  const unresolvedRows = new Map<string, StoreProductRow>();

  rows.forEach((row) => {
    const query = queryByRowId.get(row.id);
    if (query) {
      const result = resultByQuery.get(query);
      const picked = result ? pickUrl(row.store, result) : null;
      if (picked) {
        newUrlById.set(row.id, picked);
      } else if (!isProductUrl(row.store, row.provider_product_id)) {
        unresolvedRows.set(row.id, row);
      }
    }
  });

  if (secondPass && !storeSearchOnly && unresolvedRows.size) {
    const fallbackQueryByRowId = new Map<string, string>();
    const fallbackQueries: string[] = [];

    unresolvedRows.forEach((row, rowId) => {
      const query = buildFallbackQuery(row.store, row.title);
      if (!query) return;
      fallbackQueryByRowId.set(rowId, query);
      fallbackQueries.push(query);
    });

    if (fallbackQueries.length) {
      const fallbackResults = await runSearchQueries(apifyKey, fallbackQueries);
      const fallbackByQuery = new Map<string, SearchResult>();
      fallbackResults.forEach((result) => {
        const term = result.searchQuery?.term;
        if (term) {
          fallbackByQuery.set(term, result);
        }
      });

      fallbackQueryByRowId.forEach((query, rowId) => {
        const row = unresolvedRows.get(rowId);
        if (!row) return;
        const result = fallbackByQuery.get(query);
        const picked = result ? pickUrl(row.store, result) : null;
        if (!picked) return;
        newUrlById.set(row.id, picked);
        unresolvedRows.delete(row.id);
      });
    }
  }

  if ((secondPass || storeSearchOnly) && unresolvedRows.size) {
    const storeFallbackRows = Array.from(unresolvedRows.values()).filter(
      (row) => row.store === 'tesco' || row.store === 'waitrose'
    );
    if (storeFallbackRows.length) {
      const storeFallbackResults = await runStoreSearchFallback(storeFallbackRows);
      storeFallbackResults.forEach((result) => {
        if (!result.url) return;
        newUrlById.set(result.rowId, result.url);
        unresolvedRows.delete(result.rowId);
      });
    }
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

  rows.forEach((row) => {
    const newUrl = newUrlById.get(row.id) ?? '';
    lines.push(
      [
        csvEscape(row.id),
        csvEscape(row.store),
        csvEscape(row.title),
        csvEscape(row.provider_product_id),
        csvEscape(newUrl),
        csvEscape(newUrl || row.product_url),
        csvEscape(row.image_url),
      ].join(',')
    );
  });

  const updates = Array.from(newUrlById.entries()).map(([id, url]) => ({
    id,
    provider_product_id: url,
    product_url: url,
  }));

  rows.forEach((row) => {
    const newUrl = newUrlById.get(row.id);
    if (newUrl) {
      row.provider_product_id = newUrl;
      row.product_url = newUrl;
    }
  });

  const outputPath = path.join(process.cwd(), 'scripts', 'todoStoreProducts.csv');
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${rows.length} rows to ${outputPath}`);
  console.log(`Found ${updates.length} product URLs.`);

  if (apply && updates.length) {
    await updateStoreProducts(supabaseUrl, supabaseKey, updates);
    console.log(`Applied ${updates.length} updates to store_products.`);
  }
}

main().catch((error) => {
  console.error('Fetch failed:', error);
  process.exit(1);
});
