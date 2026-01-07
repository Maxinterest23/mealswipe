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

async function fetchStoreProducts(supabaseUrl: string, apiKey: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/store_products`);
  url.searchParams.set('select', 'id,store,provider_product_id,title,pack_size_value,pack_size_unit,active');
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

async function fetchLatestDatasetId(baseUrl: string, apiKey: string, actorId: string) {
  const normalizedActorId = actorId.includes('/') ? actorId.replace(/\//g, '~') : actorId;
  const endpoint = `${baseUrl.replace(/\/$/, '')}/acts/${normalizedActorId}/runs/last`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fetch last run failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as { data?: { defaultDatasetId?: string } };
  const datasetId = payload?.data?.defaultDatasetId;
  if (!datasetId) {
    throw new Error('Latest run missing defaultDatasetId.');
  }

  return datasetId;
}

async function fetchDatasetItems(
  baseUrl: string,
  apiKey: string,
  datasetId: string,
  offset: number,
  limit: number
) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/datasets/${datasetId}/items`;
  const url = new URL(endpoint);
  url.searchParams.set('clean', 'true');
  url.searchParams.set('format', 'json');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fetch dataset items failed: ${response.status} ${text}`);
  }

  return (await response.json()) as Record<string, unknown>[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  let datasetId = '';
  let pageSize = 200;
  let maxItems = 1000;

  args.forEach((arg) => {
    if (arg.startsWith('--dataset=')) {
      datasetId = arg.split('=')[1];
    } else if (arg.startsWith('--page-size=')) {
      pageSize = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--max-items=')) {
      maxItems = Number(arg.split('=')[1]);
    }
  });

  return { datasetId, pageSize, maxItems };
}

async function main() {
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const providerBaseUrl = process.env.PROVIDER_BASE_URL;
  const providerApiKey = process.env.PROVIDER_API_KEY;
  const providerActorId = process.env.PROVIDER_ACTOR_ID;
  const envDatasetId = process.env.PROVIDER_DATASET_ID;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  if (!providerBaseUrl || !providerApiKey) {
    console.error('Missing PROVIDER_BASE_URL or PROVIDER_API_KEY.');
    process.exit(1);
  }

  const args = parseArgs();
  let datasetId = args.datasetId || envDatasetId || '';
  if (!datasetId) {
    if (!providerActorId) {
      console.error('Missing PROVIDER_ACTOR_ID or PROVIDER_DATASET_ID.');
      process.exit(1);
    }
    datasetId = await fetchLatestDatasetId(providerBaseUrl, providerApiKey, providerActorId);
  }

  const storeProducts = await fetchStoreProducts(supabaseUrl, supabaseKey);
  const productByUrl = new Map<string, StoreProductRow>();
  storeProducts.forEach((product) => {
    productByUrl.set(normalizeProviderId(product.provider_product_id), product);
  });

  const nowMs = Date.now();
  const cachePostcode = 'GLOBAL';
  let offset = 0;
  let processed = 0;
  let refreshed = 0;
  let missing = 0;
  const missingSamples: string[] = [];

  while (processed < args.maxItems) {
    const items = await fetchDatasetItems(
      providerBaseUrl,
      providerApiKey,
      datasetId,
      offset,
      args.pageSize
    );
    if (!items.length) break;

    const upserts: PriceCacheRow[] = [];
    for (const entry of items) {
      const url = extractItemUrl(entry);
      if (!url) continue;
      const product = productByUrl.get(normalizeProviderId(url));
      if (!product) {
        missing += 1;
        continue;
      }
      const price = parseProviderPrice(entry);
      if (!price) {
        missing += 1;
        if (missingSamples.length < 5) {
          missingSamples.push(url);
        }
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

    await upsertPriceCache(supabaseUrl, supabaseKey, upserts);
    refreshed += upserts.length;

    processed += items.length;
    offset += items.length;
    if (items.length < args.pageSize) break;
  }

  console.log(`Refreshed ${refreshed} items. Unmatched ${missing}. Dataset ${datasetId}.`);
  if (missingSamples.length) {
    console.log(`Missing price samples: ${missingSamples.join(', ')}`);
  }
}

main().catch((error) => {
  console.error('Refresh failed:', error);
  process.exit(1);
});
