-- 0009: family phase a. Allergies on people, meal facts and per-person changes on meals,
-- and meal_verdicts (one answer per household dinner).
-- This migration only adds. It depends on neither 0007 nor 0008.

-- ---------------------------------------------------------------------------
-- people.allergies
-- ---------------------------------------------------------------------------
alter table public.people
  add column allergies text[] not null default '{}',
  add constraint people_allergies_max check (cardinality(allergies) <= 30);

-- ---------------------------------------------------------------------------
-- meals: facts about the recipe, and per-person changes
-- ---------------------------------------------------------------------------
alter table public.meals
  add column steps jsonb,
  add column total_minutes int,
  add column method text,
  add column make_ahead boolean not null default false,
  add column rating numeric,
  add column rating_count int,
  add column likes int,
  add column person_changes jsonb not null default '[]',
  add column facts_checked_at timestamptz,
  -- null steps = not known; 131072 bytes leaves room for 30,000 characters at four bytes each
  add constraint meals_steps_shape check (
    steps is null or (jsonb_typeof(steps) = 'array' and pg_column_size(steps) < 131072)),
  add constraint meals_total_minutes_range check (total_minutes between 1 and 2880),
  add constraint meals_method_known check (
    method in ('stovetop', 'oven', 'slow_cooker', 'pressure_cooker', 'grill', 'no_cook')),
  add constraint meals_rating_range check (rating >= 0 and rating <= 5),
  add constraint meals_rating_count_range check (rating_count >= 0),
  add constraint meals_likes_range check (likes >= 0),
  add constraint meals_person_changes_shape check (
    jsonb_typeof(person_changes) = 'array' and pg_column_size(person_changes) < 8192);

-- ---------------------------------------------------------------------------
-- meal_verdicts: one row per (meal, dinner date)
-- ---------------------------------------------------------------------------
create table public.meal_verdicts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households on delete cascade,
  meal_id uuid not null,
  eaten_on date not null,
  status text not null check (status in ('answered', 'skipped')),
  votes jsonb not null default '{}'
    check (jsonb_typeof(votes) = 'object' and pg_column_size(votes) < 4096),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null default auth.uid(),
  unique (meal_id, eaten_on),
  foreign key (meal_id, household_id)
    references public.meals (id, household_id) on delete cascade
);
create index meal_verdicts_household_id_idx on public.meal_verdicts (household_id);

-- An answer is never downgraded to a skip (two phones, one dinner), and who wrote the row
-- is whoever is signed in, never a value the client sent.
create function public.meal_verdicts_keep_answer() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = 'answered' and new.status = 'skipped' then
    new := old;
  end if;
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

create trigger meal_verdicts_keep_answer
  before insert or update on public.meal_verdicts
  for each row execute function public.meal_verdicts_keep_answer();

alter table public.meal_verdicts enable row level security;
revoke all on public.meal_verdicts from anon, authenticated;
-- No delete: a verdict is never removed by the app, and a delete-then-insert would get round
-- the rule that an answer is never downgraded.
grant select, insert, update on public.meal_verdicts to authenticated;

create policy meal_verdicts_select on public.meal_verdicts
  for select to authenticated using (public.is_member(household_id));
create policy meal_verdicts_insert on public.meal_verdicts
  for insert to authenticated with check (public.is_member(household_id));
create policy meal_verdicts_update on public.meal_verdicts
  for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

alter publication supabase_realtime add table public.meal_verdicts;

-- ---------------------------------------------------------------------------
-- New tables are no longer granted to anon or authenticated by default (audit SEC-9).
-- Every table grants by name.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
