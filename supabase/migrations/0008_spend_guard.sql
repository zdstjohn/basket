-- One spend guard for every paid call (AI model, Brave, Spoonacular, Kroger).
-- Sign-ups stay open, so this is what stops accounts nobody invited from running up the bills.
-- No service-role key: everything here is a security-definer function called with the user's session.
-- Only adds (and replaces kroger_spend / ai_spend_since in place); v0.1.x keeps working.

-- ---------------------------------------------------------------------------
-- Households: trusted, and a smaller default AI cap for new ones
-- ---------------------------------------------------------------------------

-- A household the owner vouches for. No update grant: only the owner sets it, with SQL, never a member.
alter table public.households add column trusted boolean not null default false;

-- New households get 50 cents a month. Existing rows (the family's 300) are left alone.
alter table public.households alter column ai_cap_cents set default 50;

-- ---------------------------------------------------------------------------
-- The numbers. One row, no policy and no grant: only the definer functions read it.
-- Change one with e.g. `update public.spend_limits set untrusted_day_cents = 100;`
-- ---------------------------------------------------------------------------

create table public.spend_limits (
  only_row boolean primary key default true check (only_row),
  -- All untrusted households together, per UTC day, in cents of AI and search.
  untrusted_day_cents numeric not null default 50 check (untrusted_day_cents >= 0),
  -- Gate calls one untrusted household may make in the last minute, and in one UTC day.
  per_minute int not null default 20 check (per_minute >= 0),
  per_day int not null default 300 check (per_day >= 0),
  -- The same, for trusted households (a planned week bursts: many estimates and searches at once).
  trusted_per_minute int not null default 60 check (trusted_per_minute >= 0),
  trusted_per_day int not null default 1500 check (trusted_per_day >= 0),
  -- Kroger lookups all untrusted households together may make per UTC day.
  untrusted_kroger_day int not null default 600 check (untrusted_kroger_day >= 0)
);
insert into public.spend_limits default values;

alter table public.spend_limits enable row level security;
revoke all on public.spend_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ai_usage: 'hold' rows (a reservation made by ai_gate before a paid call)
-- ---------------------------------------------------------------------------

-- ai_usage keeps its columns and checks; a hold is kind = 'hold', model = 'hold', cost_cents = the
-- reservation. Members can insert but never update or delete, so nobody can erase a hold.
create index ai_usage_created_at_idx on public.ai_usage (created_at);

-- Members may add usage rows but only choose these columns: id and created_at are the database's.
-- Otherwise one future-dated row would count against the shared pool for good.
revoke insert on public.ai_usage from authenticated;
grant insert (household_id, kind, model, input_tokens, output_tokens, cost_cents)
  on public.ai_usage to authenticated;

-- A non-existent time zone cannot be stored (the gate also falls back to Pacific for any old row).
create function public.households_check_time_zone() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'invalid time zone' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger households_time_zone before insert or update of time_zone on public.households
  for each row execute function public.households_check_time_zone();

-- The month's real spend (holds are reservations, not spend). Same signature as 0003.
create or replace function public.ai_spend_since(h uuid, since timestamptz) returns numeric
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(h) then
    raise exception 'not_member';
  end if;
  return coalesce((
    select sum(u.cost_cents) from public.ai_usage u
    where u.household_id = h and u.created_at >= since and u.created_at <= now() and u.kind <> 'hold'
  ), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- ai_gate: check and reserve in one step
-- ---------------------------------------------------------------------------

-- Called by the server before every paid call, with the user's session. Returns:
--   not_member  the caller is not in household h
--   cap         the household has reached its monthly cap
--   slow        it made per_minute gate calls in the last minute, or per_day today (UTC)
--   busy        it is not trusted and all untrusted households together reached untrusted_day_cents today
--   ok          a hold of hold_cents was inserted into ai_usage
-- Spend counts every real ai_usage row plus holds younger than 90 seconds, so a call in flight is
-- counted before it finishes and a burst cannot pass the cap together (the advisory lock serialises
-- the check and the insert). The real usage row is written afterwards, as before; the hold simply
-- ages out. Holds are never updated or deleted. Only rows dated now or earlier count anywhere, and a
-- hold is at most 5 cents, so a direct call cannot reserve the pool away from everyone else.
create function public.ai_gate(h uuid, hold_cents numeric) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  lim public.spend_limits%rowtype;
  lim_minute int;
  lim_day int;
  lim_pool numeric;
  cap numeric;
  tz text;
  is_trusted boolean;
  month_start timestamptz;
  day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  spent numeric;
  pool numeric;
  last_minute int;
  today int;
begin
  if h is null or not coalesce(public.is_member(h), false) then
    return 'not_member';
  end if;
  if hold_cents is null or hold_cents < 0 then
    raise exception 'bad_hold';
  end if;

  -- One household at a time. An untrusted one also takes the shared lock (always second, so no
  -- two callers can wait on each other) because the all-untrusted pool is checked and spent here.
  perform pg_advisory_xact_lock(hashtextextended('ai_gate:' || h::text, 0));
  select hh.ai_cap_cents, hh.time_zone, hh.trusted into cap, tz, is_trusted
  from public.households hh where hh.id = h;
  if not is_trusted then
    perform pg_advisory_xact_lock(hashtextextended('ai_gate:untrusted', 0));
  end if;
  -- No spend_limits row at all means the defaults, never "no limit".
  select * into lim from public.spend_limits;
  lim_pool := coalesce(lim.untrusted_day_cents, 50);
  if is_trusted then
    lim_minute := coalesce(lim.trusted_per_minute, 60);
    lim_day := coalesce(lim.trusted_per_day, 1500);
  else
    lim_minute := coalesce(lim.per_minute, 20);
    lim_day := coalesce(lim.per_day, 300);
  end if;

  -- Start of this month in the household's zone; a name Postgres does not list falls back to Pacific.
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = tz) then
    tz := 'America/Los_Angeles';
  end if;
  month_start := date_trunc('month', now() at time zone tz) at time zone tz;

  select coalesce(sum(u.cost_cents), 0) into spent
  from public.ai_usage u
  where u.household_id = h and u.created_at >= month_start and u.created_at <= now()
    and (u.kind <> 'hold' or u.created_at > now() - interval '90 seconds');
  if spent >= cap then
    return 'cap';
  end if;

  select count(*) filter (where u.created_at > now() - interval '1 minute'),
         count(*) filter (where u.created_at >= day_start)
  into last_minute, today
  from public.ai_usage u
  where u.household_id = h and u.kind = 'hold' and u.created_at <= now()
    and u.created_at >= least(day_start, now() - interval '1 minute');
  if last_minute >= lim_minute or today >= lim_day then
    return 'slow';
  end if;

  if not is_trusted then
    select coalesce(sum(u.cost_cents), 0) into pool
    from public.ai_usage u
    join public.households x on x.id = u.household_id
    where not x.trusted and u.created_at >= day_start and u.created_at <= now()
      and (u.kind <> 'hold' or u.created_at > now() - interval '90 seconds');
    if pool >= lim_pool then
      return 'busy';
    end if;
  end if;

  insert into public.ai_usage (household_id, kind, model, cost_cents)
  values (h, 'hold', 'hold', least(hold_cents, 5));
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- kroger_spend: untrusted households also share one daily pool
-- ---------------------------------------------------------------------------

alter table public.kroger_global_calls add column untrusted_calls int not null default 0;

-- Same contract as 0006 (adds n to the household's UTC-day count and returns its total; past 400 it
-- adds nothing and returns the unchanged total), plus: a household that is not trusted also adds to
-- an untrusted daily pool (spend_limits.untrusted_kroger_day, 600) and is refused, the same way,
-- when n more would pass it. The 400 per household and the 8,000 total (kroger_limited) stay.
create or replace function public.kroger_spend(h uuid, n int) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  total int;
  is_trusted boolean;
  pool int;
begin
  if not public.is_member(h) then
    raise exception 'not_member';
  end if;
  if n is null or n < 0 or n > 60 then
    raise exception 'bad_count';
  end if;
  select hh.trusted into is_trusted from public.households hh where hh.id = h;
  insert into public.kroger_calls (household_id, day, calls) values (h, today, 0)
  on conflict (household_id, day) do nothing;
  select c.calls into total from public.kroger_calls c
  where c.household_id = h and c.day = today for update;
  if total + n > 400 then
    return total;
  end if;
  insert into public.kroger_global_calls (day, calls) values (today, 0)
  on conflict (day) do nothing;
  select g.untrusted_calls into pool from public.kroger_global_calls g
  where g.day = today for update;
  if not is_trusted and pool + n > coalesce((select l.untrusted_kroger_day from public.spend_limits l), 600) then
    return total;
  end if;
  update public.kroger_calls c set calls = c.calls + n
  where c.household_id = h and c.day = today
  returning c.calls into total;
  update public.kroger_global_calls g
  set calls = g.calls + n,
      untrusted_calls = g.untrusted_calls + case when is_trusted then 0 else n end
  where g.day = today;
  return total;
end;
$$;

revoke execute on function public.ai_gate(uuid, numeric), public.kroger_spend(uuid, int)
  from public, anon;
grant execute on function public.ai_gate(uuid, numeric), public.kroger_spend(uuid, int)
  to authenticated;
