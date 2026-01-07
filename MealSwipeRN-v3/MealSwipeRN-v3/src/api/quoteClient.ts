export type QuoteUnitType = 'GRAM' | 'ML' | 'COUNT';

export interface QuoteRequestItem {
  ingredientName: string;
  required: {
    value: number;
    unit: QuoteUnitType;
  };
}

export interface QuoteRequestPayload {
  stores: string[];
  postcode?: string;
  items: QuoteRequestItem[];
}

export interface QuoteLineItem {
  canonicalItemId: string;
  canonicalName: string;
  storeProductId: string;
  productTitle: string;
  packSize: { value: number; unit: QuoteUnitType };
  required: { value: number; unit: QuoteUnitType };
  packsNeeded: number;
  price: number;
  unitPrice: number | null;
  lineTotal: number;
  consumedEstimate: number;
  currency: string;
  promoText?: string | null;
  inStock?: boolean | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  priceSource: 'cached' | 'live' | 'stale';
  fetchedAt: string;
}

export interface QuoteResponse {
  currency: string;
  quotes: Array<{
    store: string;
    basketTotal: number;
    consumedEstimate: number;
    lastUpdated: string;
    lineItems: QuoteLineItem[];
    missingItems: Array<{ ingredientName: string; reason: string }>;
    missingCount: number;
    warnings?: string[];
  }>;
  meta: {
    postcodeArea: string | null;
    ttlHours: number;
  };
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const QUOTES_ENDPOINT = process.env.EXPO_PUBLIC_QUOTES_ENDPOINT;

function resolveQuoteEndpoint() {
  if (QUOTES_ENDPOINT) return QUOTES_ENDPOINT;
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/functions/v1/quote`;
}

export async function postQuote(payload: QuoteRequestPayload): Promise<QuoteResponse> {
  const endpoint = resolveQuoteEndpoint();
  if (!endpoint || !SUPABASE_ANON_KEY) {
    throw new Error('Quote endpoint is not configured.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Quote request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as QuoteResponse;
}

export function isQuoteConfigured() {
  return Boolean(resolveQuoteEndpoint() && SUPABASE_ANON_KEY);
}
