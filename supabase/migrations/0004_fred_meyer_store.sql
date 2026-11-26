-- Fred Meyer prices from Kroger: the household's chosen store, where each price came from and when,
-- and live sync for the tables the shopping list reads.
alter table public.households
  add column kroger_location_id text,
  add column kroger_location_name text;

-- Members choose the store (column grants add to the ones in 0001_init.sql).
grant update (kroger_location_id, kroger_location_name) on public.households to authenticated;

alter table public.price_estimates
  add column updated_at timestamptz not null default now(),
  add column product_name text,
  add column product_image_url text,
  add column on_sale boolean not null default false;

alter publication supabase_realtime
  add table public.item_store, public.always_have, public.price_estimates, public.households;
