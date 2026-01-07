-- Ensure canonical item names are unique for upsert support
create unique index if not exists canonical_items_name_unique_idx
  on public.canonical_items (name);
