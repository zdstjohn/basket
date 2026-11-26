-- Basket: schema, household functions, row-level security, storage, realtime.
-- Privacy rule: every row belongs to one household; a user sees a row only if
-- they are a member of that household. anon gets nothing.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  time_zone text not null default 'America/Los_Angeles',
  week_start text not null default 'sun' check (week_start in ('sun', 'mon')),
  budget_cents int not null default 20000 check (budget_cents >= 0),
  cushion_cents int not null default 2500 check (cushion_cents >= 0),
  slots text[] not null default '{dinner}',
  ai_cap_cents int not null default 300 check (ai_cap_cents >= 0),
  recipe_source text not null default 'sites',
  category_store jsonb not null default '{}'
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  unique (household_id, user_id),
  unique (user_id) -- one household per user in v1
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_by uuid references auth.users (id) on delete set null
);
create index invites_household_id_idx on public.invites (household_id);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  age int,
  diet text not null default 'none'
    check (diet in ('none', 'vegetarian', 'vegan', 'pescatarian')),
  appetite numeric not null default 1,
  dislikes text[] not null default '{}',
  sort int not null default 0
);
create index people_household_id_idx on public.people (household_id);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  base_servings numeric not null default 4,
  ingredients jsonb not null default '[]',
  veg_swap jsonb,
  everyone_vegetarian boolean not null default false,
  is_favorite boolean not null default false,
  source_url text,
  photo_url text,
  photo_credit text,
  photo_credit_url text,
  photo_path text,
  times_planned int not null default 0,
  unique (id, household_id) -- target of composite foreign keys
);
create index meals_household_id_idx on public.meals (household_id);

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null,
  unique (household_id, week_start),
  unique (id, household_id) -- target of composite foreign keys
);

-- week_meals / week_item_state carry household_id and reference weeks (and
-- meals) through composite keys, so a row can never point at another
-- household's week or meal.
create table public.week_meals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_id uuid not null,
  day text not null,
  slot text not null,
  meal_id uuid not null,
  servings_override numeric,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  unique (week_id, day, slot),
  foreign key (week_id, household_id)
    references public.weeks (id, household_id) on delete cascade,
  foreign key (meal_id, household_id)
    references public.meals (id, household_id)
);
create index week_meals_household_id_idx on public.week_meals (household_id);
create index week_meals_meal_idx on public.week_meals (meal_id, household_id);
create index week_meals_week_idx on public.week_meals (week_id, household_id);

create table public.staples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  canonical text not null,
  amount numeric not null,
  unit text not null,
  role text not null,
  active boolean not null default true
);
create index staples_household_id_idx on public.staples (household_id);

create table public.always_have (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  canonical text not null,
  unique (household_id, canonical)
);

create table public.week_item_state (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_id uuid not null,
  item_key text not null,
  have_it boolean not null default false,
  checked boolean not null default false,
  outside_budget boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  unique (week_id, item_key),
  foreign key (week_id, household_id)
    references public.weeks (id, household_id) on delete cascade
);
create index week_item_state_household_id_idx on public.week_item_state (household_id);

create table public.item_store (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  canonical text not null,
  store text not null,
  unique (household_id, canonical)
);

create table public.price_estimates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  canonical text not null,
  store text not null,
  kind text not null,
  cents_per_base numeric not null,
  source text not null default 'ai',
  unique (household_id, canonical, store, kind)
);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_cents numeric not null default 0
);
create index ai_usage_household_id_idx on public.ai_usage (household_id, created_at);

-- ---------------------------------------------------------------------------
-- Functions (all security definer, empty search_path, fully qualified)
-- ---------------------------------------------------------------------------

create function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = h and m.user_id = (select auth.uid())
  );
$$;

create function public.is_owner(h uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = h and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- True when the first folder of a storage object name is a household uuid the
-- caller belongs to. A non-uuid (or missing) folder yields false, never an error.
create function public.is_member_of_photo_folder(object_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when (storage.foldername(object_name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_member(((storage.foldername(object_name))[1])::uuid)
    else false
  end;
$$;

create function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'invalid_name';
  end if;
  if exists (select 1 from public.members where user_id = uid) then
    raise exception 'already_in_household';
  end if;
  insert into public.households (name) values (btrim(p_name)) returning id into hid;
  insert into public.members (household_id, user_id, role) values (hid, uid, 'owner');
  return hid;
end;
$$;

create function public.create_invite() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  tok text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select household_id into hid
  from public.members where user_id = uid and role = 'owner';
  if hid is null then
    raise exception 'not_owner';
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invites (household_id, token, created_by, expires_at)
  values (hid, tok, uid, now() + interval '7 days');
  return tok;
end;
$$;

create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.invites;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into inv from public.invites where token = p_token for update;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if inv.used_by is not null then
    raise exception 'invite_used';
  end if;
  if inv.expires_at <= now() then
    raise exception 'invite_expired';
  end if;
  if exists (select 1 from public.members where user_id = uid) then
    raise exception 'already_in_household';
  end if;
  insert into public.members (household_id, user_id, role)
  values (inv.household_id, uid, 'member');
  update public.invites set used_by = uid where id = inv.id;
  return inv.household_id;
end;
$$;

revoke execute on function
  public.is_member(uuid),
  public.is_owner(uuid),
  public.is_member_of_photo_folder(text),
  public.create_household(text),
  public.create_invite(),
  public.accept_invite(text)
from public, anon;
grant execute on function
  public.is_member(uuid),
  public.is_owner(uuid),
  public.is_member_of_photo_folder(text),
  public.create_household(text),
  public.create_invite(),
  public.accept_invite(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.people enable row level security;
alter table public.meals enable row level security;
alter table public.weeks enable row level security;
alter table public.week_meals enable row level security;
alter table public.staples enable row level security;
alter table public.always_have enable row level security;
alter table public.week_item_state enable row level security;
alter table public.item_store enable row level security;
alter table public.price_estimates enable row level security;
alter table public.ai_usage enable row level security;

-- Start from nothing, then grant only what each table needs.
revoke all on all tables in schema public from anon, authenticated;

-- households: members read and update; rows are created only by create_household.
create policy households_select on public.households
  for select to authenticated using (public.is_member(id));
create policy households_update on public.households
  for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));
grant select on public.households to authenticated;
grant update (name, time_zone, week_start, budget_cents, cushion_cents, slots,
              ai_cap_cents, recipe_source, category_store)
  on public.households to authenticated;

-- members: members of a household see its roster; only the functions write.
create policy members_select on public.members
  for select to authenticated using (public.is_member(household_id));
grant select on public.members to authenticated;

-- invites: owners of the household see them; only create_invite/accept_invite write.
create policy invites_select on public.invites
  for select to authenticated using (public.is_owner(household_id));
grant select on public.invites to authenticated;

-- Household data tables: members may select, insert, update and delete.
do $$
declare
  t text;
begin
  foreach t in array array[
    'people', 'meals', 'weeks', 'week_meals', 'staples',
    'always_have', 'week_item_state', 'item_store', 'price_estimates'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member(household_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_member(household_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_member(household_id))',
      t || '_delete', t);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- ai_usage: an append-only ledger. Members can read and add, never change or remove.
create policy ai_usage_select on public.ai_usage
  for select to authenticated using (public.is_member(household_id));
create policy ai_usage_insert on public.ai_usage
  for insert to authenticated with check (public.is_member(household_id));
grant select, insert on public.ai_usage to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects under <household_id>/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict do nothing;

create policy meal_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos' and public.is_member_of_photo_folder(name));
create policy meal_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos' and public.is_member_of_photo_folder(name));
create policy meal_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'meal-photos' and public.is_member_of_photo_folder(name))
  with check (bucket_id = 'meal-photos' and public.is_member_of_photo_folder(name));
create policy meal_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos' and public.is_member_of_photo_folder(name));

-- ---------------------------------------------------------------------------
-- Realtime (changes are filtered by the policies above)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.week_meals, public.week_item_state, public.meals, public.people, public.staples;
