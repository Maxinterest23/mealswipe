import fs from 'fs';
import path from 'path';

type UnitType = 'GRAM' | 'ML' | 'COUNT';

interface StoreProductRow {
  id: string;
  store: string;
  provider_product_id: string;
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
    if (!trimmed) return 'GBP';
    const upper = trimmed.toUpperCase();
    if (upper === '£' || upper === 'GBP' || upper === 'GBX') return 'GBP';
    if (upper === '$' || upper === 'USD') return 'USD';
    if (upper === '€' || upper === 'EUR') return 'EUR';
    if (/^[A-Z]{3}$/.test(upper)) return upper;
  }
  return 'GBP';
}

function extractOffer(item: Record<string, unknown>): Record<string, unknown> | null {
  const offers = item.offers;
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      if (offer && typeof offer === 'object' && !Array.isArray(offer)) {
        return offer as Record<string, unknown>;
      }
    }
    return null;
  }
  if (offers && typeof offers === 'object' && !Array.isArray(offers)) {
    return offers as Record<string, unknown>;
  }
  return null;
}

function getOfferValue(offer: Record<string, unknown> | null, key: string): unknown {
  if (!offer) return undefined;
  if (key in offer) return offer[key];
  const priceSpec = offer.priceSpecification;
  if (priceSpec && typeof priceSpec === 'object' && !Array.isArray(priceSpec)) {
    return (priceSpec as Record<string, unknown>)[key];
  }
  return undefined;
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

function extractAdditionalProperties(item: Record<string, unknown>): Record<string, unknown> | null {
  const additional = item.additionalProperties;
  if (additional && typeof additional === 'object' && !Array.isArray(additional)) {
    return additional as Record<string, unknown>;
  }
  return null;
}

function parseProviderPrice(item: Record<string, unknown>): ProviderPrice | null {
  const offer = extractOffer(item);
  const additional = extractAdditionalProperties(item);
  const price = parseNumber(
    getOfferValue(offer, 'price') ??
      getOfferValue(offer, 'lowPrice') ??
      getOfferValue(offer, 'highPrice') ??
      item.price ??
      item.currentPrice ??
      item.offerPrice ??
      additional?.price ??
      additional?.currentPrice ??
      additional?.regularPrice ??
      additional?.offerPrice ??
      additional?.clubcardPrice ??
      additional?.priceWithTax ??
      additional?.priceWithVat
  );
  const currency = normalizeCurrency(
    getOfferValue(offer, 'priceCurrency') ??
      item.priceCurrency ??
      item.currency ??
      additional?.priceCurrency ??
      additional?.currencyRaw
  );
  const unitPrice = parseNumber(
    getOfferValue(offer, 'unitPrice') ??
      item.unitPrice ??
      additional?.unitPrice ??
      additional?.pricePerUnit
  );
  const promoText =
    typeof item.promoText === 'string'
      ? item.promoText
      : typeof additional?.promoText === 'string'
        ? additional.promoText
        : typeof additional?.offerText === 'string'
          ? additional.offerText
      : typeof item.description === 'string'
        ? item.description
        : null;
  const inStock = parseInStock(
    item.inStock ??
      getOfferValue(offer, 'availability') ??
      additional?.inStock ??
      additional?.availability
  );

  if (price === null) {
    return null;
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

function extractItemUrl(item: Record<string, unknown>): string | null {
  const url = item.url ?? item.pageUrl ?? item.productUrl ?? item.detailUrl;
  return typeof url === 'string' ? url : null;
}

function normalizeProviderId(value: string) {
  return value.trim();
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildUpserts(
  products: StoreProductRow[],
  items: Record<string, unknown>[],
  nowMs: number,
  cachePostcode: string
) {
  const priceByUrl = new Map<string, ProviderPrice>();
  const missingSamples: string[] = [];
  for (const entry of items) {
    const url = extractItemUrl(entry);
    if (!url) continue;
    const price = parseProviderPrice(entry);
    if (!price) {
      if (missingSamples.length < 5) {
        missingSamples.push(url);
      }
      continue;
    }
    priceByUrl.set(normalizeProviderId(url), price);
  }

  const upserts: PriceCacheRow[] = [];
  let missing = 0;

  for (const product of products) {
    const price = priceByUrl.get(normalizeProviderId(product.provider_product_id));
    if (!price) {
      missing += 1;
      continue;
    }
    const ttlExpiresAt = new Date(nowMs + 12 * 60 * 60 * 1000).toISOString();
    const fetchedAt = price.fetchedAt ?? new Date(nowMs).toISOString();
    upserts.push({
      store_product_id: product.id,
      postcode_area: cachePostcode,
      price: price.price,
      unit_price: price.unitPrice ?? null,
      promo_text: price.promoText ?? null,
      in_stock: price.inStock ?? null,
      currency: price.currency,
      fetched_at: fetchedAt,
      ttl_expires_at: ttlExpiresAt,
    });
  }

  if (missingSamples.length) {
    console.log(`Missing price samples: ${missingSamples.join(', ')}`);
  }

  return { upserts, missing };
}

async function fetchStoreProducts(
  supabaseUrl: string,
  apiKey: string,
  stores: string[],
  limit: number
) {
  const url = new URL(`${supabaseUrl}/rest/v1/store_products`);
  url.searchParams.set('select', 'id,store,provider_product_id,title,pack_size_value,pack_size_unit,active');
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

async function runApifyActor(
  baseUrl: string,
  apiKey: string,
  actorId: string,
  store: string,
  urls: string[],
  timeoutMs: number,
  includeExtra: boolean,
  includeStore: boolean
) {
  const normalizedActorId = actorId.includes('/') ? actorId.replace(/\//g, '~') : actorId;
  const endpoint = `${baseUrl.replace(/\/$/, '')}/acts/${normalizedActorId}/run-sync-get-dataset-items`;
  const url = new URL(endpoint);
  url.searchParams.set('clean', 'true');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(urls.length));
  url.searchParams.set('timeout', String(Math.ceil(timeoutMs / 1000)));

  const input: Record<string, unknown> = {
    detailsUrls: urls.map((detailUrl) => ({ url: detailUrl })),
    scrapeInfluencerProducts: false,
  };

  if (includeStore) {
    input.store = store;
  }

  if (includeExtra) {
    input.additionalProperties = true;
    input.additionalReviewProperties = true;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as Record<string, unknown>[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const stores: string[] = [];
  let limit = 50;
  let force = false;
  let batchSize = 3;
  let includeExtra = false;
  let includeStore = false;
  let timeoutMs = 60000;

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
    } else if (arg === '--include-extra') {
      includeExtra = true;
    } else if (arg === '--include-store') {
      includeStore = true;
    }
  });

  return { stores, limit, force, batchSize, includeExtra, includeStore, timeoutMs };
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const providerBaseUrl = process.env.PROVIDER_BASE_URL;
  const providerApiKey = process.env.PROVIDER_API_KEY;
  const providerActorId = process.env.PROVIDER_ACTOR_ID;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  if (!providerBaseUrl || !providerApiKey || !providerActorId) {
    console.error('Missing PROVIDER_BASE_URL, PROVIDER_API_KEY, or PROVIDER_ACTOR_ID.');
    process.exit(1);
  }

  const { stores, limit, force, batchSize, includeExtra, includeStore, timeoutMs } = parseArgs();

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
    if (!product.provider_product_id || product.provider_product_id.startsWith('TODO_')) {
      continue;
    }
    const list = refreshByStore.get(product.store) ?? [];
    list.push(product);
    refreshByStore.set(product.store, list);
  }

  let refreshed = 0;
  let failed = 0;

  for (const [store, products] of refreshByStore.entries()) {
    const batches = chunk(products, batchSize);
    for (const batch of batches) {
      const urls = batch.map((product) => normalizeProviderId(product.provider_product_id));
      console.log(`Refreshing ${store}: ${batch.length} urls`);
      try {
        const items = await runApifyActor(
          providerBaseUrl,
          providerApiKey,
          providerActorId,
          store,
          urls,
          timeoutMs,
          includeExtra,
          includeStore
        );

        const { upserts, missing } = buildUpserts(batch, items, nowMs, cachePostcode);
        await upsertPriceCache(supabaseUrl, supabaseKey, upserts);
        refreshed += upserts.length;
        failed += missing;
      } catch (error) {
        console.error('Batch failed, falling back to single URLs:', error);
        for (const product of batch) {
          try {
            const singleItems = await runApifyActor(
              providerBaseUrl,
              providerApiKey,
              providerActorId,
              store,
              [normalizeProviderId(product.provider_product_id)],
              timeoutMs,
              includeExtra,
              includeStore
            );
            const { upserts, missing } = buildUpserts([product], singleItems, nowMs, cachePostcode);
            await upsertPriceCache(supabaseUrl, supabaseKey, upserts);
            refreshed += upserts.length;
            failed += missing;
          } catch (singleError) {
            console.error(`Single URL failed for ${product.title}:`, singleError);
            failed += 1;
          }
        }
      }
    }
  }

  console.log(`Refreshed ${refreshed} items. Skipped ${skipped.length}. Failed ${failed}.`);
}

main().catch((error) => {
  console.error('Refresh failed:', error);
  process.exit(1);
});
