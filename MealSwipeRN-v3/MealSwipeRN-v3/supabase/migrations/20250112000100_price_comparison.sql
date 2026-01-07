-- Price comparison schema
create extension if not exists "pgcrypto";

create table if not exists public.canonical_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_type text not null check (unit_type in ('GRAM','ML','COUNT')),
  category text null,
  aliases text[] not null default '{}',
  is_pantry boolean not null default false
);

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  store text not null,
  provider_product_id text not null,
  title text not null,
  pack_size_value numeric not null,
  pack_size_unit text not null check (pack_size_unit in ('GRAM','ML','COUNT')),
  product_url text null,
  image_url text null,
  active boolean not null default true
);

create table if not exists public.canonical_to_store_product (
  canonical_item_id uuid not null references public.canonical_items(id) on delete cascade,
  store_product_id uuid not null references public.store_products(id) on delete cascade,
  priority integer not null default 0,
  notes text null,
  primary key (canonical_item_id, store_product_id)
);

create table if not exists public.price_cache (
  store_product_id uuid not null references public.store_products(id) on delete cascade,
  postcode_area text null,
  price numeric not null,
  unit_price numeric null,
  promo_text text null,
  in_stock boolean null,
  currency text not null default 'GBP',
  fetched_at timestamptz not null default now(),
  ttl_expires_at timestamptz not null,
  primary key (store_product_id, postcode_area)
);

create table if not exists public.quote_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request jsonb not null,
  response jsonb not null,
  notes text null
);

create index if not exists price_cache_ttl_expires_at_idx
  on public.price_cache (ttl_expires_at);

create index if not exists store_products_store_provider_idx
  on public.store_products (store, provider_product_id);

create index if not exists canonical_items_name_idx
  on public.canonical_items (name);
