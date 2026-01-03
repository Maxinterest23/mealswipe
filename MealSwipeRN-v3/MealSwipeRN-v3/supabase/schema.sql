-- Supabase schema for MealSwipe endless feed
create extension if not exists "pgcrypto";

create table if not exists public.recipes_published (
  id text primary key,
  title text not null,
  description text,
  image_url text,
  icon text,
  image_gradient text,
  servings integer,
  prep_min integer,
  cook_min integer,
  rest_min integer default 0,
  total_min integer,
  difficulty text,
  cost_tier smallint,
  dietary_tags text[] default '{}'::text[],
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  nutrition jsonb,
  tips jsonb,
  substitutions jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipes_published_created_at_id_idx
  on public.recipes_published (created_at desc, id desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_recipes_published_updated_at on public.recipes_published;
create trigger set_recipes_published_updated_at
before update on public.recipes_published
for each row execute function public.set_updated_at();

alter table public.recipes_published enable row level security;

drop policy if exists "Public read recipes_published" on public.recipes_published;
create policy "Public read recipes_published"
  on public.recipes_published
  for select
  using (true);

-- Optional staging tables for the content pipeline
create table if not exists public.recipes_raw (
  id uuid primary key default gen_random_uuid(),
  source text,
  payload jsonb not null,
  status text default 'new',
  ingested_at timestamptz not null default now()
);

create table if not exists public.recipes_normalized (
  id uuid primary key default gen_random_uuid(),
  raw_id uuid references public.recipes_raw(id),
  normalized jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_recipes_normalized_updated_at on public.recipes_normalized;
create trigger set_recipes_normalized_updated_at
before update on public.recipes_normalized
for each row execute function public.set_updated_at();
