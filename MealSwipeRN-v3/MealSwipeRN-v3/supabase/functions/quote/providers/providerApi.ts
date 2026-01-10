export type UnitType = 'GRAM' | 'ML' | 'COUNT';

export interface ProviderProduct {
  id: string;
  title: string;
  packSizeValue: number;
  packSizeUnit: UnitType;
  productUrl?: string | null;
  imageUrl?: string | null;
}

export interface ProviderPrice {
  price: number;
  currency: string;
  unitPrice?: number | null;
  promoText?: string | null;
  inStock?: boolean | null;
  fetchedAt?: string | null;
}

export interface ProviderBulkPrice {
  providerProductId: string;
  price: ProviderPrice;
}

export interface PricingProvider {
  searchProducts(params: { store: string; query: string; postcode?: string }): Promise<ProviderProduct[]>;
  getProductPrice(params: { store: string; providerProductId: string; postcode?: string }): Promise<ProviderPrice>;
  getProductPrices?: (params: {
    store: string;
    providerProductIds: string[];
    postcode?: string;
  }) => Promise<ProviderBulkPrice[]>;
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 2;
const DEFAULT_CURRENCY = 'GBP';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

type UnknownRecord = Record<string, unknown>;

function getEnv(key: string, required = true): string | undefined {
  const value = Deno.env.get(key);
  if (!value && required) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
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
        throw new Error(`Provider request failed (${response.status}): ${text}`);
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown provider error');
      if (attempt >= retries) break;
      await sleep(300 * (attempt + 1));
      attempt += 1;
    }
  }

  throw lastError ?? new Error('Provider request failed');
}

function buildScrapeHeaders() {
  const userAgent = getEnv('SCRAPER_USER_AGENT', false) ?? DEFAULT_USER_AGENT;
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
    throw new Error('Provider response missing price data. Update provider parsing.');
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

function parseTimeoutMs() {
  const raw = getEnv('SCRAPER_TIMEOUT_MS', false) ?? getEnv('PROVIDER_TIMEOUT_MS', false);
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
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

async function scrapeProductPrice(url: string, timeoutMs: number) {
  const response = await fetchWithRetry(url, { method: 'GET', headers: buildScrapeHeaders() }, DEFAULT_RETRIES, timeoutMs);
  const html = await response.text();
  const product = findProductData(html);
  if (!product) {
    throw new Error('Provider response missing price data. Update provider parsing.');
  }
  return parseProviderPrice(product);
}

export function createProvider(): PricingProvider {
  const timeoutMs = parseTimeoutMs();

  return {
    async searchProducts({ store, query }) {
      void store;
      void query;
      return [];
    },

    async getProductPrice({ providerProductId }) {
      const url = normalizeProviderId(providerProductId);
      if (!url || !isHttpUrl(url)) {
        throw new Error('Provider product id must be a valid URL.');
      }
      return await scrapeProductPrice(url, timeoutMs);
    },

    async getProductPrices({ providerProductIds }) {
      const uniqueUrls = Array.from(new Set(providerProductIds.map((url) => url.trim()))).filter(
        (url) => url && isHttpUrl(url)
      );
      if (!uniqueUrls.length) return [];

      const results: ProviderBulkPrice[] = [];
      const entries = await Promise.all(
        uniqueUrls.map(async (url) => {
          try {
            const price = await scrapeProductPrice(url, timeoutMs);
            return { url, price };
          } catch (error) {
            console.error('Scrape failed:', error);
            return null;
          }
        })
      );

      for (const entry of entries) {
        if (!entry) continue;
        results.push({ providerProductId: entry.url, price: entry.price });
      }

      return results;
    },
  };
}
