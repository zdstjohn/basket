-- Shopping-list flags are now keyed by the food alone. Fold 'food#kind' rows into one row per food.
--
-- TIMING (pre-flight ruling I7): the app release that reads and writes food keys ships first, and this
-- migration is applied about a week AFTER that release, not with it. A phone may still run the old
-- script and write 'food#kind' rows; applying this at release would delete rows that script just wrote.
-- Until it is applied, the app's foldItemState reads old-key rows correctly and every write to the
-- food key carries the folded flags, so nothing is lost. Old rows belong to old weeks by then.
--
-- A row that already exists under the food key is kept as it is (it wins whole).
with old as (
  delete from public.week_item_state
  where item_key ~ '#(mass|volume|count(:.*)?)$'
  returning household_id, week_id,
            regexp_replace(item_key, '#(mass|volume|count(:.*)?)$', '') as food,
            have_it, checked, outside_budget
), folded as (
  select household_id, week_id, food,
         bool_or(have_it) as have_it, bool_or(checked) as checked, bool_or(outside_budget) as outside_budget
  from old group by household_id, week_id, food
)
insert into public.week_item_state (household_id, week_id, item_key, have_it, checked, outside_budget)
select household_id, week_id, food, have_it, checked, outside_budget from folded
on conflict (week_id, item_key) do nothing;
