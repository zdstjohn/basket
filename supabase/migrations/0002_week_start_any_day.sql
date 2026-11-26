-- week_start may be any day of the week, not just sun/mon.
alter table public.households drop constraint if exists households_week_start_check;
alter table public.households add constraint households_week_start_check
  check (week_start in ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'));
