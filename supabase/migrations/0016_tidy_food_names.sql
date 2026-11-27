-- Tidy stored food names so every row can be found and removed by the name the app reads.
-- The app spells a food one way: NFC, spaces collapsed, trimmed, lower case (normFood in lib/domain/list.ts).
-- Rows saved before that may be spelled otherwise. This rewrites them the same way.
-- Data only and safe to run again: when two rows tidy to the same name, the most recently updated one is kept.

create function public.tidy_food(s text) returns text
language sql immutable
as $$
  select lower(btrim(regexp_replace(normalize(s, NFC),
    '[\s   -     　﻿]+', ' ', 'g')))
$$;

create function public.tidy_food_names() returns void
language plpgsql
as $$
begin
  -- Each block: drop the rows that lose a clash (newest of each tidy name wins), then rewrite the rest.

  delete from public.always_have t using (
    select id, row_number() over (partition by household_id, public.tidy_food(canonical)
                                  order by created_at desc, id) as rn
    from public.always_have) r
  where t.id = r.id and r.rn > 1;
  update public.always_have set canonical = public.tidy_food(canonical) where canonical <> public.tidy_food(canonical);

  delete from public.item_store t using (
    select id, row_number() over (partition by household_id, public.tidy_food(canonical)
                                  order by created_at desc, id) as rn
    from public.item_store) r
  where t.id = r.id and r.rn > 1;
  update public.item_store set canonical = public.tidy_food(canonical) where canonical <> public.tidy_food(canonical);

  delete from public.price_estimates t using (
    select id, row_number() over (partition by household_id, public.tidy_food(canonical), store, kind
                                  order by updated_at desc, created_at desc, id) as rn
    from public.price_estimates) r
  where t.id = r.id and r.rn > 1;
  update public.price_estimates set canonical = public.tidy_food(canonical) where canonical <> public.tidy_food(canonical);

  -- The newest row stays as it is when it holds a product or wording (a new search clears the product on purpose).
  -- Only a newest row with neither takes the newest product and wording the others have.
  update public.item_product_choice t
  set upc = f.upc, search_term = f.search_term
  from (
    select (array_agg(id order by updated_at desc, created_at desc, id))[1] as keep,
           (array_agg(upc order by updated_at desc, created_at desc, id) filter (where upc is not null))[1] as upc,
           (array_agg(search_term order by updated_at desc, created_at desc, id) filter (where search_term is not null))[1] as search_term
    from public.item_product_choice
    group by household_id, public.tidy_food(canonical)
    having count(*) > 1) f
  where t.id = f.keep and t.upc is null and t.search_term is null;
  delete from public.item_product_choice t using (
    select id, row_number() over (partition by household_id, public.tidy_food(canonical)
                                  order by updated_at desc, created_at desc, id) as rn
    from public.item_product_choice) r
  where t.id = r.id and r.rn > 1;
  update public.item_product_choice set canonical = public.tidy_food(canonical) where canonical <> public.tidy_food(canonical);

  delete from public.kroger_matches t using (
    select id, row_number() over (partition by household_id, location_id, public.tidy_food(canonical)
                                  order by fetched_at desc, created_at desc, id) as rn
    from public.kroger_matches) r
  where t.id = r.id and r.rn > 1;
  update public.kroger_matches set canonical = public.tidy_food(canonical) where canonical <> public.tidy_food(canonical);

  -- Flags have no update time: the latest created row stays and folds in every clashing row's ticks
  -- (any true stays true, the largest pack count stays), as 0007 does.
  update public.week_item_state t
  set have_it = f.have_it, checked = f.checked, outside_budget = f.outside_budget, pack_count = f.pack_count
  from (
    select (array_agg(id order by created_at desc, id))[1] as keep,
           bool_or(have_it) as have_it, bool_or(checked) as checked, bool_or(outside_budget) as outside_budget,
           max(pack_count) as pack_count
    from public.week_item_state
    group by week_id, public.tidy_food(item_key)
    having count(*) > 1) f
  where t.id = f.keep;
  delete from public.week_item_state t using (
    select id, row_number() over (partition by week_id, public.tidy_food(item_key)
                                  order by created_at desc, id) as rn
    from public.week_item_state) r
  where t.id = r.id and r.rn > 1;
  update public.week_item_state set item_key = public.tidy_food(item_key) where item_key <> public.tidy_food(item_key);
end;
$$;

-- Only the migration (and tests, as superuser) run this; the app never calls it.
revoke all on function public.tidy_food_names() from public, anon, authenticated;

select public.tidy_food_names();
