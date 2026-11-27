-- 0010: busy nights and linked leftover nights (family phase b).
-- Only adds. Depends on nothing after 0001, so it is safe to apply before or after 0007-0009.

alter table public.households
  add column busy_days text[] not null default '{}'
  check (busy_days <@ array['sun','mon','tue','wed','thu','fri','sat'] and cardinality(busy_days) <= 7);
grant update (busy_days) on public.households to authenticated;

alter table public.weeks
  add column busy_days text[] not null default '{}'
  check (busy_days <@ array['sun','mon','tue','wed','thu','fri','sat'] and cardinality(busy_days) <= 7);

alter table public.week_meals
  add column leftover_of uuid references public.week_meals (id) on delete cascade,
  add constraint week_meals_leftover_not_self check (leftover_of is null or leftover_of <> id);

-- One leftovers night per cooking night; it also serves lookups by leftover_of.
create unique index week_meals_one_leftover on public.week_meals (leftover_of) where leftover_of is not null;

-- A leftovers row must follow a cooking night of the same meal in the same week.
create function public.week_meals_leftover_check() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare parent public.week_meals;
begin
  -- A different dinner put on a leftovers night (by any version of the app) becomes an ordinary dinner.
  if tg_op = 'UPDATE'
     and new.meal_id is distinct from old.meal_id
     and new.leftover_of is not distinct from old.leftover_of
     and new.leftover_of is not null then
    new.leftover_of := null;
    return new;
  end if;
  if new.leftover_of is not null then
    select * into parent from public.week_meals where id = new.leftover_of;
    if not found
       or parent.week_id <> new.week_id
       or parent.meal_id <> new.meal_id
       or parent.leftover_of is not null then
      raise exception 'leftovers must follow a cooking night of the same meal in the same week'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger week_meals_leftover_check
  before insert or update on public.week_meals
  for each row execute function public.week_meals_leftover_check();

-- Leftovers of a dinner that is no longer that dinner, of a night that became leftovers itself,
-- or of a cooking night whose servings were lowered or cleared (so it is no longer a double), are dropped.
create function public.week_meals_leftover_tidy() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (tg_op = 'UPDATE' and new.meal_id is distinct from old.meal_id)
     or new.leftover_of is not null
     or (tg_op = 'UPDATE'
         and new.servings_override is distinct from old.servings_override
         and (new.servings_override is null or new.servings_override < old.servings_override)) then
    delete from public.week_meals where leftover_of = new.id;
  end if;
  return null;
end $$;

create trigger week_meals_leftover_tidy
  after insert or update on public.week_meals
  for each row execute function public.week_meals_leftover_tidy();

revoke all on function public.week_meals_leftover_check() from public, anon, authenticated;
revoke all on function public.week_meals_leftover_tidy() from public, anon, authenticated;

alter publication supabase_realtime add table public.weeks;
