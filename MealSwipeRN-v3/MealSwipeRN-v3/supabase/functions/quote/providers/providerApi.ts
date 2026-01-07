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

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRIES = 2;
const DEFAULT_ITEMS_LIMIT = 1;
const DEFAULT_CURRENCY = 'GBP';

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

function buildHeaders(apiKey: string, host?: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...(host ? { Host: host } : {}),
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

function extractItemUrl(item: UnknownRecord): string | null {
  const url = item.url ?? item.pageUrl ?? item.productUrl ?? item.detailUrl;
  return typeof url === 'string' ? url : null;
}

function parseProviderPrice(item: UnknownRecord): ProviderPrice {
  const offer = extractOffer(item);
  const price = parseNumber(
    getOfferValue(offer, 'price') ??
      item.price ??
      item.currentPrice ??
      item.offerPrice
  );
  const currency = normalizeCurrency(
    getOfferValue(offer, 'priceCurrency') ?? item.priceCurrency ?? item.currency
  );
  const unitPrice = parseNumber(
    getOfferValue(offer, 'unitPrice') ?? item.unitPrice
  );
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
  const raw = getEnv('PROVIDER_TIMEOUT_MS', false);
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function parseBooleanEnv(key: string, defaultValue: boolean) {
  const raw = getEnv(key, false);
  if (!raw) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return defaultValue;
}

export function createProvider(): PricingProvider {
  const baseUrl = getEnv('PROVIDER_BASE_URL');
  const apiKey = getEnv('PROVIDER_API_KEY');
  const host = getEnv('PROVIDER_HOST', false);
  const actorId = getEnv('PROVIDER_ACTOR_ID');
  const timeoutMs = parseTimeoutMs();
  const includeExtra = parseBooleanEnv('PROVIDER_INCLUDE_EXTRA', false);
  const includeStore = parseBooleanEnv('PROVIDER_INCLUDE_STORE', false);
  const normalizedActorId = actorId.includes('/') ? actorId.replace(/\//g, '~') : actorId;

  const apifyBaseUrl = baseUrl.replace(/\/$/, '');
  const runSyncEndpoint = `${apifyBaseUrl}/acts/${normalizedActorId}/run-sync-get-dataset-items`;

  async function runActor(input: Record<string, unknown>, itemsLimit = DEFAULT_ITEMS_LIMIT) {
    const url = new URL(runSyncEndpoint);
    url.searchParams.set('clean', 'true');
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(itemsLimit));
    url.searchParams.set('timeout', String(Math.ceil(timeoutMs / 1000)));

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: buildHeaders(apiKey, host),
        body: JSON.stringify(input),
      },
      DEFAULT_RETRIES,
      timeoutMs
    );

    return (await response.json()) as unknown[];
  }

  function buildDetailsInput(
    store: string,
    urls: string[],
    postcode?: string
  ) {
    const input: Record<string, unknown> = {
      detailsUrls: urls.map((url) => ({ url })),
      scrapeInfluencerProducts: false,
    };

    if (includeStore) {
      input.store = store;
    }

    if (includeExtra) {
      input.additionalProperties = true;
      input.additionalReviewProperties = true;
    }

    if (postcode) {
      input.postcode = postcode;
    }

    return input;
  }

  return {
    async searchProducts({ store, query, postcode }) {
      const input = {
        store,
        search: query,
        postcode,
      };

      const items = await runActor(input);
      if (!items.length) return [];

      // TODO: Map Apify actor output to ProviderProduct fields.
      return [];
    },

    async getProductPrice({ store, providerProductId, postcode }) {
      const input = buildDetailsInput(store, [providerProductId], postcode);

      const items = await runActor(input);
      const item = items[0] as Record<string, unknown> | undefined;
      if (!item) {
        throw new Error('Provider response missing price data. Update provider parsing.');
      }

      return parseProviderPrice(item);
    },

    async getProductPrices({ store, providerProductIds, postcode }) {
      const uniqueUrls = Array.from(new Set(providerProductIds.map((url) => url.trim()))).filter(Boolean);
      if (!uniqueUrls.length) return [];

      const input = buildDetailsInput(store, uniqueUrls, postcode);

      const items = await runActor(input, uniqueUrls.length);
      const results: ProviderBulkPrice[] = [];

      for (const entry of items) {
        const item = asRecord(entry);
        if (!item) continue;
        const url = extractItemUrl(item);
        if (!url) continue;
        try {
          const price = parseProviderPrice(item);
          results.push({ providerProductId: url, price });
        } catch (error) {
          console.error('Provider parse error:', error);
        }
      }

      return results;
    },
  };
}
