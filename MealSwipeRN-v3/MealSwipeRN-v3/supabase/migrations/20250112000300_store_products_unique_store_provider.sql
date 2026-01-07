-- Enforce uniqueness for store + provider_product_id
create unique index if not exists store_products_store_provider_unique_idx
  on public.store_products (store, provider_product_id);
