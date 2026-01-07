import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createProvider, UnitType } from '../quote/providers/providerApi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TTL_HOURS = 12;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const REQUEST_DELAY_MS = 150;
const DEFAULT_BATCH_SIZE = 3;
const MAX_BATCH_SIZE = 10;

interface RefreshRequestBody {
  stores?: string[];
  storeProductIds?: string[];
  postcode?: string;
  force?: boolean;
  limit?: number;
}

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

function extractPostcodeArea(postcode?: string) {
  if (!postcode) return null;
  const trimmed = postcode.trim().toUpperCase();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  return parts[0] ?? null;
}

function isCacheFresh(cache: PriceCacheRow, nowMs: number) {
  return new Date(cache.ttl_expires_at).getTime() > nowMs;
}

function normalizeProviderId(value: string) {
  return value.trim();
}

function parseBatchSize() {
  const raw = Deno.env.get('PROVIDER_BATCH_SIZE');
  if (!raw) return DEFAULT_BATCH_SIZE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(parsed)));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST /refresh-prices.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json()) as RefreshRequestBody;
    const stores = Array.isArray(body.stores) ? body.stores : [];
    const storeProductIds = Array.isArray(body.storeProductIds) ? body.storeProductIds : [];
    const force = Boolean(body.force);
    const limitValue = typeof body.limit === 'number' ? body.limit : DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(MAX_LIMIT, limitValue));

    const postcodeArea = extractPostcodeArea(body.postcode);
    const cachePostcode = postcodeArea ?? 'GLOBAL';

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SB_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL/SB_URL or SUPABASE_SERVICE_ROLE_KEY/SB_SERVICE_ROLE_KEY.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    const provider = createProvider();

    let query = supabase
      .from('store_products')
      .select('id,store,provider_product_id,title,pack_size_value,pack_size_unit,active')
      .eq('active', true);

    if (stores.length) {
      query = query.in('store', stores);
    }
    if (storeProductIds.length) {
      query = query.in('id', storeProductIds);
    }

    query = query.limit(limit);

    const { data: storeRows, error: storeError } = await query;
    if (storeError) {
      throw new Error(`Failed to load store products: ${storeError.message}`);
    }

    const storeProducts = (storeRows as StoreProductRow[]) ?? [];
    if (!storeProducts.length) {
      return new Response(
        JSON.stringify({
          refreshed: 0,
          skippedFresh: 0,
          failed: 0,
          total: 0,
          meta: { postcodeArea, ttlHours: TTL_HOURS },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const storeProductIdList = storeProducts.map((product) => product.id);
    const { data: cacheRows, error: cacheError } = await supabase
      .from('price_cache')
      .select('*')
      .in('store_product_id', storeProductIdList)
      .eq('postcode_area', cachePostcode);

    if (cacheError) {
      throw new Error(`Failed to load price cache: ${cacheError.message}`);
    }

    const cacheMap = new Map<string, PriceCacheRow>();
    (cacheRows as PriceCacheRow[]).forEach((row) => {
      cacheMap.set(row.store_product_id, row);
    });

    const nowMs = Date.now();
    let refreshed = 0;
    let skippedFresh = 0;
    let failed = 0;
    const errors: Array<{ storeProductId: string; reason: string }> = [];
    const batchSize = parseBatchSize();

    const toRefreshByStore = new Map<string, StoreProductRow[]>();
    for (const product of storeProducts) {
      const cached = cacheMap.get(product.id);

      if (!force && cached && isCacheFresh(cached, nowMs)) {
        skippedFresh += 1;
        continue;
      }

      const providerId = normalizeProviderId(product.provider_product_id);
      if (!providerId || providerId.startsWith('TODO_')) {
        failed += 1;
        errors.push({
          storeProductId: product.id,
          reason: 'missing_provider_url',
        });
        continue;
      }

      const list = toRefreshByStore.get(product.store) ?? [];
      list.push(product);
      toRefreshByStore.set(product.store, list);
    }

    if (provider.getProductPrices) {
      const storeEntries = Array.from(toRefreshByStore.entries());
      for (let index = 0; index < storeEntries.length; index += 1) {
        const [store, products] = storeEntries[index];
        const batches = chunk(products, batchSize);
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
          const batch = batches[batchIndex];
          try {
            const providerPrices = await provider.getProductPrices({
              store,
              providerProductIds: batch.map((product) => product.provider_product_id),
              postcode: body.postcode,
            });

            const priceById = new Map<string, typeof providerPrices[number]['price']>();
            providerPrices.forEach((entry) => {
              priceById.set(normalizeProviderId(entry.providerProductId), entry.price);
            });

            for (const product of batch) {
              const providerPrice = priceById.get(normalizeProviderId(product.provider_product_id));
              if (!providerPrice) {
                failed += 1;
                errors.push({
                  storeProductId: product.id,
                  reason: 'provider_missing_price',
                });
                continue;
              }

              const ttlExpiresAt = new Date(nowMs + TTL_HOURS * 60 * 60 * 1000).toISOString();
              const fetchedAt = providerPrice.fetchedAt ?? new Date(nowMs).toISOString();

              const upsertRow = {
                store_product_id: product.id,
                postcode_area: cachePostcode,
                price: providerPrice.price,
                unit_price: providerPrice.unitPrice ?? null,
                promo_text: providerPrice.promoText ?? null,
                in_stock: providerPrice.inStock ?? null,
                currency: providerPrice.currency,
                fetched_at: fetchedAt,
                ttl_expires_at: ttlExpiresAt,
              };

              const { error: upsertError } = await supabase
                .from('price_cache')
                .upsert(upsertRow, { onConflict: 'store_product_id,postcode_area' });

              if (upsertError) {
                failed += 1;
                errors.push({
                  storeProductId: product.id,
                  reason: upsertError.message,
                });
                continue;
              }

              refreshed += 1;
            }
          } catch (error) {
            batch.forEach((product) => {
              failed += 1;
              errors.push({
                storeProductId: product.id,
                reason: error instanceof Error ? error.message : 'Provider error',
              });
            });
          }

          if (batchIndex < batches.length - 1) {
            await sleep(REQUEST_DELAY_MS);
          }
        }

        if (index < storeEntries.length - 1) {
          await sleep(REQUEST_DELAY_MS);
        }
      }
    } else {
      const products = Array.from(toRefreshByStore.values()).flat();
      for (let i = 0; i < products.length; i += 1) {
        const product = products[i];
        try {
          const providerPrice = await provider.getProductPrice({
            store: product.store,
            providerProductId: product.provider_product_id,
            postcode: body.postcode,
          });

          const ttlExpiresAt = new Date(nowMs + TTL_HOURS * 60 * 60 * 1000).toISOString();
          const fetchedAt = providerPrice.fetchedAt ?? new Date(nowMs).toISOString();

          const upsertRow = {
            store_product_id: product.id,
            postcode_area: cachePostcode,
            price: providerPrice.price,
            unit_price: providerPrice.unitPrice ?? null,
            promo_text: providerPrice.promoText ?? null,
            in_stock: providerPrice.inStock ?? null,
            currency: providerPrice.currency,
            fetched_at: fetchedAt,
            ttl_expires_at: ttlExpiresAt,
          };

          const { error: upsertError } = await supabase
            .from('price_cache')
            .upsert(upsertRow, { onConflict: 'store_product_id,postcode_area' });

          if (upsertError) {
            throw new Error(upsertError.message);
          }

          refreshed += 1;
        } catch (error) {
          failed += 1;
          errors.push({
            storeProductId: product.id,
            reason: error instanceof Error ? error.message : 'Provider error',
          });
        }

        if (i < products.length - 1) {
          await sleep(REQUEST_DELAY_MS);
        }
      }
    }

    return new Response(
      JSON.stringify({
        refreshed,
        skippedFresh,
        failed,
        total: storeProducts.length,
        errors,
        meta: { postcodeArea, ttlHours: TTL_HOURS },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
