import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { UnitType } from './providers/providerApi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TTL_HOURS = 24;

interface QuoteRequestItem {
  ingredientName: string;
  required: {
    value: number;
    unit: UnitType;
  };
}

interface QuoteRequestBody {
  stores: string[];
  postcode?: string;
  items: QuoteRequestItem[];
}

interface CanonicalItemRow {
  id: string;
  name: string;
  unit_type: UnitType;
  aliases: string[] | null;
}

interface StoreProductRow {
  id: string;
  store: string;
  provider_product_id: string;
  title: string;
  pack_size_value: number;
  pack_size_unit: UnitType;
  product_url: string | null;
  image_url: string | null;
  active: boolean;
}

interface StoreMappingRow {
  canonical_item_id: string;
  priority: number;
  store_products: StoreProductRow | null;
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

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function isCacheFresh(cache: PriceCacheRow, nowMs: number) {
  return new Date(cache.ttl_expires_at).getTime() > nowMs;
}

function ceilPacks(required: number, packSize: number) {
  if (packSize <= 0) return 0;
  return Math.ceil(required / packSize);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST /quote.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json()) as QuoteRequestBody;
    const stores = Array.isArray(body.stores) ? body.stores : [];
    const items = Array.isArray(body.items) ? body.items : [];
    const postcodeArea = extractPostcodeArea(body.postcode);
    const cachePostcode = postcodeArea ?? 'GLOBAL';

    if (!stores.length || !items.length) {
      return new Response(JSON.stringify({ error: 'stores and items are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SB_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL/SB_URL or SUPABASE_SERVICE_ROLE_KEY/SB_SERVICE_ROLE_KEY.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    const { data: canonicalRows, error: canonicalError } = await supabase
      .from('canonical_items')
      .select('id,name,unit_type,aliases');

    if (canonicalError) {
      throw new Error(`Failed to load canonical items: ${canonicalError.message}`);
    }

    const canonicalLookup = new Map<string, CanonicalItemRow>();
    (canonicalRows as CanonicalItemRow[]).forEach((row) => {
      canonicalLookup.set(normalizeKey(row.name), row);
      (row.aliases ?? []).forEach((alias) => canonicalLookup.set(normalizeKey(alias), row));
    });

    const aggregated = new Map<string, { item: CanonicalItemRow; requiredValue: number }>();
    const baseMissingItems: Array<{ ingredientName: string; reason: string }> = [];

    for (const item of items) {
      const key = normalizeKey(item.ingredientName);
      const canonical = canonicalLookup.get(key);
      if (!canonical) {
        baseMissingItems.push({ ingredientName: item.ingredientName, reason: 'no_canonical_match' });
        continue;
      }

      if (canonical.unit_type !== item.required.unit) {
        baseMissingItems.push({
          ingredientName: item.ingredientName,
          reason: 'unit_mismatch',
        });
        continue;
      }

      const existing = aggregated.get(canonical.id);
      if (existing) {
        existing.requiredValue += item.required.value;
      } else {
        aggregated.set(canonical.id, { item: canonical, requiredValue: item.required.value });
      }
    }

    const canonicalIds = Array.from(aggregated.keys());
    const nowMs = Date.now();

    const quotes = [] as Array<Record<string, unknown>>;

    for (const store of stores) {
      const missingItems: Array<Record<string, unknown>> = [...baseMissingItems];

      const { data: mappingRows, error: mappingError } = await supabase
        .from('canonical_to_store_product')
        .select('canonical_item_id,priority,store_products(id,store,provider_product_id,title,pack_size_value,pack_size_unit,product_url,image_url,active)')
        .in('canonical_item_id', canonicalIds)
        .eq('store_products.store', store)
        .eq('store_products.active', true);

      if (mappingError) {
        throw new Error(`Failed to load store mappings: ${mappingError.message}`);
      }

      const mappingByCanonical = new Map<string, StoreMappingRow>();
      (mappingRows as StoreMappingRow[]).forEach((row) => {
        if (!row.store_products) return;
        const existing = mappingByCanonical.get(row.canonical_item_id);
        if (!existing || row.priority >= existing.priority) {
          mappingByCanonical.set(row.canonical_item_id, row);
        }
      });

      const storeProductIds = Array.from(mappingByCanonical.values())
        .map((row) => row.store_products?.id)
        .filter(Boolean) as string[];

      let priceCache = new Map<string, PriceCacheRow>();
      if (storeProductIds.length) {
        let cacheQuery = supabase
          .from('price_cache')
          .select('*')
          .in('store_product_id', storeProductIds);

        cacheQuery = cacheQuery.eq('postcode_area', cachePostcode);

        const { data: cacheRows, error: cacheError } = await cacheQuery;
        if (cacheError) {
          throw new Error(`Failed to load price cache: ${cacheError.message}`);
        }

        (cacheRows as PriceCacheRow[]).forEach((row) => {
          priceCache.set(row.store_product_id, row);
        });
      }

      const lineItems: Array<Record<string, unknown>> = [];
      let basketTotal = 0;
      let consumedEstimate = 0;
      let latestUpdateMs = 0;
      let staleCount = 0;

      for (const [canonicalId, aggregatedItem] of aggregated.entries()) {
        const mapping = mappingByCanonical.get(canonicalId);
        if (!mapping || !mapping.store_products) {
          missingItems.push({
            ingredientName: aggregatedItem.item.name,
            reason: 'no_store_mapping',
          });
          continue;
        }

        const storeProduct = mapping.store_products;
        if (storeProduct.pack_size_unit !== aggregatedItem.item.unit_type) {
          missingItems.push({
            ingredientName: aggregatedItem.item.name,
            reason: 'unit_mismatch',
          });
          continue;
        }

        const priceRow = priceCache.get(storeProduct.id) ?? null;
        let priceSource: 'cached' | 'stale' = 'cached';

        if (!priceRow) {
          missingItems.push({
            ingredientName: aggregatedItem.item.name,
            reason: 'no_cached_price',
          });
          continue;
        }

        if (!isCacheFresh(priceRow, nowMs)) {
          priceSource = 'stale';
          staleCount += 1;
        }

        const packSize = Number(storeProduct.pack_size_value);
        const packsNeeded = ceilPacks(aggregatedItem.requiredValue, packSize);
        const lineTotal = packsNeeded * Number(priceRow.price);
        const unitPrice = priceRow.unit_price ?? (packSize > 0 ? Number(priceRow.price) / packSize : null);
        const consumedCost = unitPrice ? aggregatedItem.requiredValue * unitPrice : lineTotal;

        basketTotal += lineTotal;
        consumedEstimate += consumedCost;

        const fetchedAtMs = new Date(priceRow.fetched_at).getTime();
        if (fetchedAtMs > latestUpdateMs) {
          latestUpdateMs = fetchedAtMs;
        }

        lineItems.push({
          canonicalItemId: aggregatedItem.item.id,
          canonicalName: aggregatedItem.item.name,
          storeProductId: storeProduct.id,
          productTitle: storeProduct.title,
          packSize: {
            value: packSize,
            unit: storeProduct.pack_size_unit,
          },
          required: {
            value: aggregatedItem.requiredValue,
            unit: aggregatedItem.item.unit_type,
          },
          packsNeeded,
          price: Number(priceRow.price),
          unitPrice: unitPrice ? Number(unitPrice) : null,
          lineTotal,
          consumedEstimate: consumedCost,
          currency: priceRow.currency,
          promoText: priceRow.promo_text,
          inStock: priceRow.in_stock,
          productUrl: storeProduct.product_url,
          imageUrl: storeProduct.image_url,
          priceSource,
          fetchedAt: priceRow.fetched_at,
        });
      }

      const totalItemsCount = aggregated.size + baseMissingItems.length;
      const missingRatio = totalItemsCount ? missingItems.length / totalItemsCount : 0;
      const warnings: string[] = [];
      if (missingRatio > 0.2) {
        warnings.push('Some items are missing. Prices may be incomplete.');
      }
      if (staleCount > 0) {
        warnings.push('Some prices are stale. Refresh prices for the latest data.');
      }

      quotes.push({
        store,
        basketTotal: Number(basketTotal.toFixed(2)),
        consumedEstimate: Number(consumedEstimate.toFixed(2)),
        lastUpdated: latestUpdateMs ? new Date(latestUpdateMs).toISOString() : new Date(nowMs).toISOString(),
        lineItems,
        missingItems,
        missingCount: missingItems.length,
        warnings,
      });
    }

    const responsePayload = {
      currency: 'GBP',
      quotes,
      meta: {
        postcodeArea,
        ttlHours: TTL_HOURS,
      },
    };

    try {
      await supabase.from('quote_logs').insert({
        request: {
          ...body,
          postcode: postcodeArea,
        },
        response: responsePayload,
        notes: null,
      });
    } catch (error) {
      console.error('Quote log insert failed:', error);
    }

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
