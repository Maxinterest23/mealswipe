-- Cleanup duplicate store_products by (store, provider_product_id)
-- Keeps the smallest id per group and re-points mappings.
-- Review in a transaction before committing.

begin;

create temporary table tmp_store_product_dupes on commit drop as
with dupes as (
  select store, provider_product_id, min(id::text)::uuid as keep_id
  from public.store_products
  group by store, provider_product_id
  having count(*) > 1
)
select sp.id, d.keep_id
from public.store_products sp
join dupes d
  on d.store = sp.store
 and d.provider_product_id = sp.provider_product_id
where sp.id <> d.keep_id;

delete from public.canonical_to_store_product c
using tmp_store_product_dupes r
where c.store_product_id = r.id
  and exists (
    select 1
    from public.canonical_to_store_product c2
    where c2.canonical_item_id = c.canonical_item_id
      and c2.store_product_id = r.keep_id
  );

update public.canonical_to_store_product c
set store_product_id = r.keep_id
from tmp_store_product_dupes r
where c.store_product_id = r.id;

delete from public.price_cache pc
using tmp_store_product_dupes r
where pc.store_product_id = r.id;

delete from public.store_products sp
using tmp_store_product_dupes r
where sp.id = r.id;

commit;
