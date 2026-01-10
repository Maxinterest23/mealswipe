import fs from 'fs';
import path from 'path';

type UnitType = 'GRAM' | 'ML' | 'COUNT';

interface StoreProductRow {
  id: string;
  store: string;
  provider_product_id: string;
  product_url: string | null;
  title: string;
  pack_size_value: number;
  pack_size_unit: UnitType;
  active: boolean;
}

interface PriceCacheRow {
  store_product_id: string;
  postcode_area: string | null;
  price: number;
  unit_price: number | null;
  promo_text: string | null;
  in_stock: boolean | null;
  currency: string;
  fetched_at: string;
  ttl_expires_at: string;
}

interface ProviderPrice {
  price: number;
  currency: string;
  unitPrice?: number | null;
  promoText?: string | null;
  inStock?: boolean | null;
  fetchedAt?: string | null;
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 2;
const DEFAULT_CURRENCY = 'GBP';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const TTL_HOURS = 24;
const REQUEST_DELAY_MS = 150;

type UnknownRecord = Record<string, unknown>;

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

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  retries = DEFAULT_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Scrape request failed (${response.status}): ${text}`);
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown scrape error');
      if (attempt >= retries) break;
      await sleep(300 * (attempt + 1));
      attempt += 1;
    }
  }

  throw lastError ?? new Error('Scrape request failed');
}

function buildScrapeHeaders() {
  const userAgent = process.env.SCRAPER_USER_AGENT ?? DEFAULT_USER_AGENT;
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Cache-Control': 'no-cache',
  };
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCurrency(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_CURRENCY;
    const upper = trimmed.toUpperCase();
    if (upper === '£' || upper === 'GBP' || upper === 'GBX') return 'GBP';
    if (upper === '$' || upper === 'USD') return 'USD';
    if (upper === '€' || upper === 'EUR') return 'EUR';
    if (/^[A-Z]{3}$/.test(upper)) return upper;
  }
  return DEFAULT_CURRENCY;
}

function extractOffer(item: UnknownRecord): UnknownRecord | null {
  const offers = item.offers;
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      const record = asRecord(offer);
      if (record) return record;
    }
    return null;
  }
  return asRecord(offers);
}

function getOfferValue(offer: UnknownRecord | null, key: string): unknown {
  if (!offer) return undefined;
  if (key in offer) return offer[key];
  const priceSpec = asRecord(offer.priceSpecification);
  return priceSpec?.[key];
}

function parseInStock(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('instock')) return true;
    if (lower.includes('outofstock')) return false;
  }
  return null;
}

function parseProviderPrice(item: UnknownRecord): ProviderPrice {
  const offer = extractOffer(item);
  const price = parseNumber(
    getOfferValue(offer, 'price') ??
      getOfferValue(offer, 'lowPrice') ??
      getOfferValue(offer, 'highPrice') ??
      item.price ??
      item.currentPrice ??
      item.offerPrice
  );
  const currency = normalizeCurrency(
    getOfferValue(offer, 'priceCurrency') ?? item.priceCurrency ?? item.currency
  );
  const unitPrice = parseNumber(getOfferValue(offer, 'unitPrice') ?? item.unitPrice);
  const promoText =
    typeof item.promoText === 'string'
      ? item.promoText
      : typeof item.description === 'string'
        ? item.description
        : null;
  const inStock = parseInStock(item.inStock ?? getOfferValue(offer, 'availability'));

  if (price === null) {
    throw new Error('Provider response missing price data.');
  }

  return {
    price,
    currency,
    unitPrice,
    promoText,
    inStock,
    fetchedAt: new Date().toISOString(),
  };
}

function extractJsonLdBlocks(html: string) {
  const blocks: string[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) blocks.push(match[1]);
  }
  return blocks;
}

function normalizeJsonLdValue(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.map(asRecord).filter(Boolean) as UnknownRecord[];
  }
  const record = asRecord(value);
  return record ? [record] : [];
}

function extractJsonLd(html: string): UnknownRecord[] {
  const blocks = extractJsonLdBlocks(html);
  const items: UnknownRecord[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      items.push(...normalizeJsonLdValue(parsed));
    } catch (error) {
      console.error('JSON-LD parse failed:', error);
    }
  }
  return items;
}

function extractNextData(html: string): UnknownRecord | null {
  const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match || !match[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return asRecord(parsed);
  } catch (error) {
    console.error('Next data parse failed:', error);
    return null;
  }
}

function isProductType(typeValue: unknown) {
  if (typeof typeValue === 'string') {
    return typeValue.toLowerCase().includes('product');
  }
  if (Array.isArray(typeValue)) {
    return typeValue.some(
      (entry) => typeof entry === 'string' && entry.toLowerCase().includes('product')
    );
  }
  return false;
}

function findProductNode(value: unknown): UnknownRecord | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findProductNode(entry);
      if (found) return found;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  if (isProductType(record['@type'])) return record;

  if (record['@graph']) {
    const found = findProductNode(record['@graph']);
    if (found) return found;
  }

  for (const key of Object.keys(record)) {
    const found = findProductNode(record[key]);
    if (found) return found;
  }

  return null;
}

function findOfferNode(value: unknown): UnknownRecord | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findOfferNode(entry);
      if (found) return found;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  if (record.offers || record.price) return record;

  for (const key of Object.keys(record)) {
    const found = findOfferNode(record[key]);
    if (found) return found;
  }

  return null;
}

function findProductData(html: string): UnknownRecord | null {
  const jsonLdItems = extractJsonLd(html);
  for (const entry of jsonLdItems) {
    const product = findProductNode(entry);
    if (product) return product;
    const offer = findOfferNode(entry);
    if (offer) return offer;
  }

  const nextData = extractNextData(html);
  if (nextData) {
    const product = findProductNode(nextData) ?? findOfferNode(nextData);
    if (product) return product;
  }

  return null;
}

async function scrapeProductPrice(url: string, timeoutMs: number): Promise<ProviderPrice | null> {
  try {
    const response = await fetchWithRetry(url, { method: 'GET', headers: buildScrapeHeaders() }, DEFAULT_RETRIES, timeoutMs);
    const html = await response.text();
    const product = findProductData(html);
    if (!product) {
      return null;
    }
    return parseProviderPrice(product);
  } catch (error) {
    console.error(`Scrape failed for ${url}:`, error);
    return null;
  }
}

function resolveProductUrl(product: StoreProductRow) {
  const providerUrl = product.provider_product_id?.trim();
  if (providerUrl && !providerUrl.startsWith('TODO_') && isHttpUrl(providerUrl)) return providerUrl;
  const productUrl = product.product_url?.trim();
  if (productUrl && !productUrl.startsWith('TODO_') && isHttpUrl(productUrl)) return productUrl;
  return null;
}

function normalizeProviderId(value: string) {
  return value.trim();
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchStoreProducts(
  supabaseUrl: string,
  apiKey: string,
  stores: string[],
  limit: number
) {
  const url = new URL(`${supabaseUrl}/rest/v1/store_products`);
  url.searchParams.set(
    'select',
    'id,store,provider_product_id,product_url,title,pack_size_value,pack_size_unit,active'
  );
  url.searchParams.set('active', 'eq.true');
  if (stores.length) {
    url.searchParams.set('store', `in.(${stores.map((store) => `"${store}"`).join(',')})`);
  }
  url.searchParams.set('limit', String(limit));

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

async function fetchPriceCache(
  supabaseUrl: string,
  apiKey: string,
  storeProductIds: string[],
  postcodeArea: string
) {
  if (!storeProductIds.length) return new Map<string, PriceCacheRow>();

  const url = new URL(`${supabaseUrl}/rest/v1/price_cache`);
  url.searchParams.set('select', '*');
  url.searchParams.set('store_product_id', `in.(${storeProductIds.map((id) => `"${id}"`).join(',')})`);
  url.searchParams.set('postcode_area', `eq.${postcodeArea}`);

  const response = await fetch(url.toString(), {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fetch price_cache failed: ${response.status} ${text}`);
  }

  const rows = (await response.json()) as PriceCacheRow[];
  const map = new Map<string, PriceCacheRow>();
  rows.forEach((row) => map.set(row.store_product_id, row));
  return map;
}

function isCacheFresh(cache: PriceCacheRow, nowMs: number) {
  return new Date(cache.ttl_expires_at).getTime() > nowMs;
}

async function upsertPriceCache(
  supabaseUrl: string,
  apiKey: string,
  rows: PriceCacheRow[]
) {
  if (!rows.length) return;
  const response = await fetch(`${supabaseUrl}/rest/v1/price_cache`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upsert price_cache failed: ${response.status} ${text}`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const stores: string[] = [];
  let limit = 200;
  let force = false;
  let batchSize = Number(process.env.SCRAPER_BATCH_SIZE) || 4;
  let timeoutMs = Number(process.env.SCRAPER_TIMEOUT_MS ?? process.env.PROVIDER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  args.forEach((arg) => {
    if (arg.startsWith('--stores=')) {
      const value = arg.split('=')[1];
      stores.push(...value.split(',').map((store) => store.trim()).filter(Boolean));
    } else if (arg.startsWith('--limit=')) {
      limit = Number(arg.split('=')[1]);
    } else if (arg === '--force') {
      force = true;
    } else if (arg.startsWith('--batch=')) {
      batchSize = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--timeout=')) {
      timeoutMs = Number(arg.split('=')[1]);
    }
  });

  return { stores, limit, force, batchSize, timeoutMs };
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const { stores, limit, force, batchSize, timeoutMs } = parseArgs();

  const storeProducts = await fetchStoreProducts(supabaseUrl, supabaseKey, stores, limit);
  if (!storeProducts.length) {
    console.log('No store products found.');
    return;
  }

  const cachePostcode = 'GLOBAL';
  const cacheMap = await fetchPriceCache(
    supabaseUrl,
    supabaseKey,
    storeProducts.map((product) => product.id),
    cachePostcode
  );

  const nowMs = Date.now();
  const refreshByStore = new Map<string, StoreProductRow[]>();
  const skipped: StoreProductRow[] = [];

  for (const product of storeProducts) {
    const cached = cacheMap.get(product.id);
    if (!force && cached && isCacheFresh(cached, nowMs)) {
      skipped.push(product);
      continue;
    }

    const url = resolveProductUrl(product);
    if (!url) {
      continue;
    }

    const list = refreshByStore.get(product.store) ?? [];
    list.push({ ...product, provider_product_id: normalizeProviderId(url) });
    refreshByStore.set(product.store, list);
  }

  let refreshed = 0;
  let failed = 0;

  for (const [store, products] of refreshByStore.entries()) {
    const batches = chunk(products, batchSize);
    for (const batch of batches) {
      console.log(`Scraping ${store}: ${batch.length} products`);

      const results = await Promise.all(
        batch.map(async (product) => {
          const url = normalizeProviderId(product.provider_product_id);
          const price = await scrapeProductPrice(url, timeoutMs);
          if (!price) return null;

          const packSize = Number(product.pack_size_value);
          const unitPrice =
            price.unitPrice ?? (packSize > 0 ? Number(price.price) / packSize : null);
          const ttlExpiresAt = new Date(nowMs + TTL_HOURS * 60 * 60 * 1000).toISOString();
          const fetchedAt = price.fetchedAt ?? new Date(nowMs).toISOString();

          return {
            store_product_id: product.id,
            postcode_area: cachePostcode,
            price: price.price,
            unit_price: unitPrice,
            promo_text: price.promoText ?? null,
            in_stock: price.inStock ?? null,
            currency: price.currency,
            fetched_at: fetchedAt,
            ttl_expires_at: ttlExpiresAt,
          } satisfies PriceCacheRow;
        })
      );

      const upserts = results.filter(Boolean) as PriceCacheRow[];
      const missing = results.length - upserts.length;
      if (upserts.length) {
        await upsertPriceCache(supabaseUrl, supabaseKey, upserts);
      }

      refreshed += upserts.length;
      failed += missing;

      if (REQUEST_DELAY_MS > 0) {
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }

  console.log(`Refreshed ${refreshed} items. Skipped ${skipped.length}. Failed ${failed}.`);
}

main().catch((error) => {
  console.error('Refresh failed:', error);
  process.exit(1);
});
