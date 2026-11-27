-- Fred Meyer products and cart: product matches, per-person Kroger links, cart sends,
-- price history, and the Kroger call counters (per household and one global total).
-- Only adds; v0.1.x keeps working.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Server cache of product lookups. `fetched_at` has a default but members may update the row;
-- the daily cap lives in kroger_calls (not writable), so it does not depend on this column.
create table public.kroger_matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  location_id text not null,
  canonical text not null,
  term text not null,
  candidates jsonb not null default '[]',
  fetched_at timestamptz not null default now(),
  unique (household_id, location_id, canonical),
  check (pg_column_size(candidates) < 65536)
);

create table public.item_product_choice (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  canonical text not null,
  upc text check (upc is null or upc ~ '^[0-9]{13}$'),
  search_term text check (search_term is null or char_length(search_term) between 2 and 80),
  updated_at timestamptz not null default now(),
  unique (household_id, canonical)
);

-- One sealed (encrypted by the server) token set per person; readable only by that person.
create table public.kroger_links (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  sealed text not null check (char_length(sealed) < 4000),
  profile_id text,
  updated_at timestamptz not null default now()
);

create table public.cart_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  profile_id text,
  modality text not null check (modality in ('PICKUP', 'DELIVERY')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  items jsonb not null default '[]',
  total_cents int not null default 0 check (total_cents >= 0),
  foreign key (week_id, household_id)
    references public.weeks (id, household_id) on delete cascade
);
create index cart_sends_week_id_idx on public.cart_sends (week_id);
create index cart_sends_household_id_idx on public.cart_sends (household_id);

create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  location_id text not null,
  upc text not null,
  regular_cents int not null check (regular_cents > 0),
  promo_cents int,
  seen_on date not null default current_date,
  unique (household_id, location_id, upc, seen_on)
);

-- Lookup counters, written only by kroger_spend().
create table public.kroger_calls (
  household_id uuid not null references public.households (id) on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (household_id, day)
);

-- One row per UTC day, all households together. No policy and no grant: only kroger_spend()
-- and kroger_limited() (security definer) touch it.
create table public.kroger_global_calls (
  day date primary key,
  calls int not null default 0
);

alter table public.week_item_state
  add column pack_count int check (pack_count between 1 and 99);

alter table public.households
  add column fulfillment text not null default 'PICKUP'
    check (fulfillment in ('PICKUP', 'DELIVERY'));

-- ---------------------------------------------------------------------------
-- Row-level security and grants
-- ---------------------------------------------------------------------------

alter table public.kroger_matches enable row level security;
alter table public.item_product_choice enable row level security;
alter table public.kroger_links enable row level security;
alter table public.cart_sends enable row level security;
alter table public.price_observations enable row level security;
alter table public.kroger_calls enable row level security;
alter table public.kroger_global_calls enable row level security;

revoke all on public.kroger_matches, public.item_product_choice, public.kroger_links,
  public.cart_sends, public.price_observations, public.kroger_calls,
  public.kroger_global_calls from anon, authenticated;

-- kroger_matches: members read, insert, update.
grant select, insert, update on public.kroger_matches to authenticated;
create policy kroger_matches_select on public.kroger_matches
  for select to authenticated using (public.is_member(household_id));
create policy kroger_matches_insert on public.kroger_matches
  for insert to authenticated with check (public.is_member(household_id));
create policy kroger_matches_update on public.kroger_matches
  for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- item_product_choice: members read and write.
grant select, insert, update, delete on public.item_product_choice to authenticated;
create policy item_product_choice_select on public.item_product_choice
  for select to authenticated using (public.is_member(household_id));
create policy item_product_choice_insert on public.item_product_choice
  for insert to authenticated with check (public.is_member(household_id));
create policy item_product_choice_update on public.item_product_choice
  for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy item_product_choice_delete on public.item_product_choice
  for delete to authenticated using (public.is_member(household_id));

-- kroger_links: the owner only, on every verb.
grant select, insert, update, delete on public.kroger_links to authenticated;
create policy kroger_links_select on public.kroger_links
  for select to authenticated using (user_id = (select auth.uid()));
create policy kroger_links_insert on public.kroger_links
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy kroger_links_update on public.kroger_links
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy kroger_links_delete on public.kroger_links
  for delete to authenticated using (user_id = (select auth.uid()));

-- cart_sends: members read; only the sender inserts and updates status, items, total.
grant select, insert, update (status, items, total_cents) on public.cart_sends to authenticated;
create policy cart_sends_select on public.cart_sends
  for select to authenticated using (public.is_member(household_id));
create policy cart_sends_insert on public.cart_sends
  for insert to authenticated
  with check (public.is_member(household_id) and user_id = (select auth.uid()));
create policy cart_sends_update on public.cart_sends
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_member(household_id))
  with check (user_id = (select auth.uid()) and public.is_member(household_id));

-- price_observations: members read and insert.
grant select, insert on public.price_observations to authenticated;
create policy price_observations_select on public.price_observations
  for select to authenticated using (public.is_member(household_id));
create policy price_observations_insert on public.price_observations
  for insert to authenticated with check (public.is_member(household_id));

-- kroger_calls: members read; no write grants.
grant select on public.kroger_calls to authenticated;
create policy kroger_calls_select on public.kroger_calls
  for select to authenticated using (public.is_member(household_id));

grant update (fulfillment) on public.households to authenticated;

-- ---------------------------------------------------------------------------
-- Call counters
-- ---------------------------------------------------------------------------

-- Adds n lookups to today's (UTC) count for the household and to the all-households total.
-- Returns the household's total. When current + n would pass the household's daily cap (400,
-- DAILY_LOOKUPS in the app), nothing is added to either counter and the current total is
-- returned, so one household can add at most 400 a day to the global total.
create function public.kroger_spend(h uuid, n int) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  total int;
begin
  if not public.is_member(h) then
    raise exception 'not_member';
  end if;
  if n is null or n < 0 or n > 60 then
    raise exception 'bad_count';
  end if;
  insert into public.kroger_calls (household_id, day, calls) values (h, today, 0)
  on conflict (household_id, day) do nothing;
  select c.calls into total from public.kroger_calls c
  where c.household_id = h and c.day = today for update;
  if total + n > 400 then
    return total;
  end if;
  update public.kroger_calls c set calls = c.calls + n
  where c.household_id = h and c.day = today
  returning c.calls into total;
  insert into public.kroger_global_calls as g (day, calls) values (today, n)
  on conflict (day) do update set calls = g.calls + n;
  return total;
end;
$$;

-- True when all households together have used more than 8,000 lookups today (UTC).
create function public.kroger_limited() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select g.calls > 8000 from public.kroger_global_calls g
    where g.day = (now() at time zone 'utc')::date
  ), false);
$$;

revoke execute on function public.kroger_spend(uuid, int), public.kroger_limited()
  from public, anon;
grant execute on function public.kroger_spend(uuid, int), public.kroger_limited()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.kroger_matches, public.item_product_choice, public.cart_sends;
