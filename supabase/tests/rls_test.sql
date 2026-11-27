-- Row-level security tests for Basket (pgTAP).
-- Runs with `supabase test db` and also as one SQL call; everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(96);

-- ---------------------------------------------------------------------------
-- Fixtures (as the superuser)
-- ---------------------------------------------------------------------------
create temp table t_kv (k text primary key, v text not null);
grant all on t_kv to public;

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@example.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'b@example.test', 'authenticated', 'authenticated'),
  ('cccccccc-0000-4000-8000-00000000000c', 'c@example.test', 'authenticated', 'authenticated'),
  ('dddddddd-0000-4000-8000-00000000000d', 'd@example.test', 'authenticated', 'authenticated');

-- Switch identity. Always called as the superuser (after `reset role`).
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

-- Seed one row in every household table, as the superuser.
create function pg_temp.seed(key text, h uuid) returns void language plpgsql as $$
declare m uuid; w uuid;
begin
  insert into public.people (household_id, name, age) values (h, 'P-' || key, 30);
  insert into public.meals (household_id, name) values (h, 'M-' || key) returning id into m;
  insert into public.weeks (household_id, week_start) values (h, '2026-11-29') returning id into w;
  insert into public.week_meals (household_id, week_id, day, slot, meal_id)
    values (h, w, 'mon', 'dinner', m);
  insert into public.week_item_state (household_id, week_id, item_key) values (h, w, 'rice');
  insert into public.staples (household_id, canonical, amount, unit, role)
    values (h, 'milk', 1, 'l', 'dairy');
  insert into public.always_have (household_id, canonical) values (h, 'salt');
  insert into public.item_store (household_id, canonical, store) values (h, 'milk', 'costco');
  insert into public.price_estimates (household_id, canonical, store, kind, cents_per_base)
    values (h, 'milk', 'costco', 'unit', 0.5);
  insert into public.ai_usage (household_id, kind, model, input_tokens, output_tokens, cost_cents)
    values (h, 'parse', 'test', 10, 10, 1);
  insert into t_kv values ('M_' || key, m::text), ('W_' || key, w::text);
end $$;

-- A and B each create their own household through the function.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
insert into t_kv select 'HA', public.create_household('Alpha family')::text;
reset role;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-00000000000b');
insert into t_kv select 'HB', public.create_household('Bravo family')::text;
reset role;

select pg_temp.seed('A', (select v::uuid from t_kv where k = 'HA'));
select pg_temp.seed('B', (select v::uuid from t_kv where k = 'HB'));

-- One private photo in each household's folder, plus used/expired/valid invites.
insert into storage.objects (bucket_id, name)
select 'meal-photos', v || '/seed.jpg' from t_kv where k in ('HA', 'HB');
insert into public.invites (household_id, token, created_by, expires_at, used_by) values
  ((select v::uuid from t_kv where k = 'HA'), 'expired-token',
   'aaaaaaaa-0000-4000-8000-00000000000a', now() - interval '1 hour', null),
  ((select v::uuid from t_kv where k = 'HA'), 'used-token',
   'aaaaaaaa-0000-4000-8000-00000000000a', now() + interval '1 day',
   'dddddddd-0000-4000-8000-00000000000d'),
  ((select v::uuid from t_kv where k = 'HA'), 'valid-2',
   'aaaaaaaa-0000-4000-8000-00000000000a', now() + interval '1 day', null);

-- ---------------------------------------------------------------------------
-- As A (owner of HA): isolation from HB
-- ---------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');

select ok(public.is_member((select v::uuid from t_kv where k = 'HA')), 'A is a member of HA');
select ok(not public.is_member((select v::uuid from t_kv where k = 'HB')), 'A is not a member of HB');
select is((select count(*)::int from public.households), 1, 'A sees only one household');
select is((select count(*)::int from public.households where id = (select v::uuid from t_kv where k = 'HB')), 0, 'A cannot see household HB');

select is((select count(*)::int from public.people where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB people');
select is((select count(*)::int from public.meals where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB meals');
select is((select count(*)::int from public.weeks where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB weeks');
select is((select count(*)::int from public.week_meals where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB week_meals');
select is((select count(*)::int from public.week_item_state where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB week_item_state');
select is((select count(*)::int from public.price_estimates where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB price_estimates');
select is((select count(*)::int from public.ai_usage where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB ai_usage');
select is((select count(*)::int from public.staples where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB staples');
select is((select count(*)::int from public.always_have where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB always_have');
select is((select count(*)::int from public.item_store where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB item_store');
select is((select count(*)::int from public.members where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB members');
select is((select count(*)::int from public.invites where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB invites');

-- Positive controls: A does see HA's own rows.
select is((select count(*)::int from public.people where household_id = (select v::uuid from t_kv where k = 'HA')), 1, 'A sees HA people');
select is((select count(*)::int from public.meals where household_id = (select v::uuid from t_kv where k = 'HA')), 1, 'A sees HA meals');
select is((select count(*)::int from public.week_meals where household_id = (select v::uuid from t_kv where k = 'HA')), 1, 'A sees HA week_meals');
select is((select count(*)::int from public.ai_usage where household_id = (select v::uuid from t_kv where k = 'HA')), 1, 'A sees HA ai_usage');
select is((select count(*)::int from public.members), 1, 'A sees only the HA roster');

-- Writes into HB are refused.
select throws_ok($q$insert into public.people (household_id, name) values ((select v::uuid from t_kv where k = 'HB'), 'intruder')$q$, '42501', null, 'A cannot insert a person into HB');
select throws_ok($q$insert into public.meals (household_id, name) values ((select v::uuid from t_kv where k = 'HB'), 'intruder')$q$, '42501', null, 'A cannot insert a meal into HB');
select throws_ok($q$insert into public.ai_usage (household_id, kind, model) values ((select v::uuid from t_kv where k = 'HB'), 'parse', 'x')$q$, '42501', null, 'A cannot insert ai_usage into HB');
select throws_ok($q$insert into public.week_meals (household_id, week_id, day, slot, meal_id) values ((select v::uuid from t_kv where k = 'HB'), (select v::uuid from t_kv where k = 'W_B'), 'tue', 'dinner', (select v::uuid from t_kv where k = 'M_B'))$q$, '42501', null, 'A cannot insert a week_meal into HB');
select throws_ok($q$update public.people set household_id = (select v::uuid from t_kv where k = 'HB') where household_id = (select v::uuid from t_kv where k = 'HA')$q$, '42501', null, 'A cannot move a person into HB');

-- Writes to HA work.
select lives_ok($q$insert into public.people (household_id, name) values ((select v::uuid from t_kv where k = 'HA'), 'Extra')$q$, 'A can insert a person into HA');
select lives_ok($q$insert into public.ai_usage (household_id, kind, model) values ((select v::uuid from t_kv where k = 'HA'), 'parse', 'x')$q$, 'A can insert ai_usage into HA');
update public.households set budget_cents = 30000 where id = (select v::uuid from t_kv where k = 'HA');
select is((select budget_cents from public.households where id = (select v::uuid from t_kv where k = 'HA')), 30000, 'A can update the HA budget');
-- Attempt on HB: filtered by the policy (0 rows); verified as B below.
update public.households set budget_cents = 1 where id = (select v::uuid from t_kv where k = 'HB');

-- Choosing a Fred Meyer store: members of the household may; nobody else can.
update public.households set kroger_location_id = '70100390', kroger_location_name = 'Fred Meyer - Tacoma-Stevens' where id = (select v::uuid from t_kv where k = 'HA');
select is((select kroger_location_id from public.households where id = (select v::uuid from t_kv where k = 'HA')), '70100390', 'A can set the HA Fred Meyer store');
select is((select kroger_location_name from public.households where id = (select v::uuid from t_kv where k = 'HA')), 'Fred Meyer - Tacoma-Stevens', 'A can set the HA store name');
-- Attempt on HB: filtered by the policy (0 rows); verified as B below.
update public.households set kroger_location_id = '99999999', kroger_location_name = 'Rogue store' where id = (select v::uuid from t_kv where k = 'HB');

-- ai_usage is append-only.
select throws_ok($q$delete from public.ai_usage$q$, '42501', null, 'A cannot delete ai_usage');
select throws_ok($q$update public.ai_usage set cost_cents = 0$q$, '42501', null, 'A cannot update ai_usage');

-- Membership and household rows are only written through the functions.
select throws_ok($q$insert into public.members (household_id, user_id, role) values ((select v::uuid from t_kv where k = 'HB'), 'aaaaaaaa-0000-4000-8000-00000000000a', 'owner')$q$, '42501', null, 'A cannot add themself to HB');
select throws_ok($q$update public.members set role = 'owner'$q$, '42501', null, 'A cannot update members');
select throws_ok($q$delete from public.members$q$, '42501', null, 'A cannot delete members');
select throws_ok($q$insert into public.households (name) values ('Rogue')$q$, '42501', null, 'A cannot insert a household directly');
select throws_ok($q$delete from public.households$q$, '42501', null, 'A cannot delete a household');
select throws_ok($q$insert into public.invites (household_id, token, created_by, expires_at) values ((select v::uuid from t_kv where k = 'HA'), 'forged', 'aaaaaaaa-0000-4000-8000-00000000000a', now() + interval '1 day')$q$, '42501', null, 'A cannot insert an invite directly');

-- Uniqueness and cross-household references.
select throws_ok($q$insert into public.week_meals (household_id, week_id, day, slot, meal_id) values ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), 'mon', 'dinner', (select v::uuid from t_kv where k = 'M_A'))$q$, '23505', null, 'duplicate (week_id, day, slot) is a unique violation');
select throws_ok($q$insert into public.week_meals (household_id, week_id, day, slot, meal_id) values ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_B'), 'tue', 'dinner', (select v::uuid from t_kv where k = 'M_A'))$q$, '23503', null, 'a week_meal cannot point at HB''s week');
select throws_ok($q$insert into public.week_meals (household_id, week_id, day, slot, meal_id) values ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), 'wed', 'dinner', (select v::uuid from t_kv where k = 'M_B'))$q$, '23503', null, 'a week_meal cannot point at HB''s meal');
select throws_ok($q$insert into public.week_item_state (household_id, week_id, item_key) values ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_B'), 'beans')$q$, '23503', null, 'a week_item_state cannot point at HB''s week');

-- Household functions.
select throws_ok($q$select public.create_household('Second')$q$, 'P0001', 'already_in_household', 'create_household fails for a user already in a household');

select lives_ok($q$insert into t_kv select 'TOKEN_A', public.create_invite()$q$, 'owner A can create an invite');
select matches((select v from t_kv where k = 'TOKEN_A'), '^[0-9a-f]{64}$', 'invite token is 32 random bytes of hex');
select is((select count(*)::int from public.invites where token = (select v from t_kv where k = 'TOKEN_A')), 1, 'owner A can read the invite');

-- Storage.
select is((select count(*)::int from storage.objects where bucket_id = 'meal-photos' and name like (select v from t_kv where k = 'HB') || '/%'), 0, 'A cannot see HB photos');
select is((select count(*)::int from storage.objects where bucket_id = 'meal-photos' and name like (select v from t_kv where k = 'HA') || '/%'), 1, 'A can see HA photos');
select throws_ok($q$insert into storage.objects (bucket_id, name) values ('meal-photos', (select v from t_kv where k = 'HB') || '/evil.jpg')$q$, '42501', null, 'A cannot upload into HB''s photo folder');
select lives_ok($q$insert into storage.objects (bucket_id, name) values ('meal-photos', (select v from t_kv where k = 'HA') || '/new.jpg')$q$, 'A can upload into HA''s photo folder');
select throws_ok($q$insert into storage.objects (bucket_id, name) values ('meal-photos', 'not-a-uuid/evil.jpg')$q$, '42501', null, 'a non-uuid folder is refused, not an error');
select throws_ok($q$insert into storage.objects (bucket_id, name) values ('meal-photos', 'loose.jpg')$q$, '42501', null, 'a photo outside any household folder is refused');
-- Storage blocks raw deletes unless this is set; the policy must still filter.
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'meal-photos' and name like (select v from t_kv where k = 'HB') || '/%';
update storage.objects set name = (select v from t_kv where k = 'HB') || '/renamed.jpg' where bucket_id = 'meal-photos' and name like (select v from t_kv where k = 'HB') || '/%';

reset role;

-- ---------------------------------------------------------------------------
-- As B: A's attempts left HB untouched, and B cannot see HA
-- ---------------------------------------------------------------------------
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-00000000000b');

select is((select budget_cents from public.households where id = (select v::uuid from t_kv where k = 'HB')), 20000, 'B cannot be changed by A: HB budget is untouched');
select is((select kroger_location_id from public.households where id = (select v::uuid from t_kv where k = 'HB')), null, 'A cannot set the HB Fred Meyer store');
select is((select kroger_location_name from public.households where id = (select v::uuid from t_kv where k = 'HA')), null, 'B cannot see the HA store name');
select is((select count(*)::int from public.people where household_id = (select v::uuid from t_kv where k = 'HA')), 0, 'B sees no HA people');
select is((select count(*)::int from public.invites where household_id = (select v::uuid from t_kv where k = 'HA')), 0, 'B cannot read A''s invites');
select is((select count(*)::int from public.ai_usage), 1, 'B still has exactly its own ai_usage row');
select is((select count(*)::int from storage.objects where bucket_id = 'meal-photos' and name = (select v from t_kv where k = 'HB') || '/seed.jpg'), 1, 'B''s photo survived A''s delete and rename attempts');
select throws_ok($q$select public.accept_invite('valid-2')$q$, 'P0001', 'already_in_household', 'a user in a household cannot accept an invite');

reset role;

-- ---------------------------------------------------------------------------
-- As C: joining HA through an invite
-- ---------------------------------------------------------------------------
select pg_temp.act_as('cccccccc-0000-4000-8000-00000000000c');

select ok(not public.is_member((select v::uuid from t_kv where k = 'HA')), 'C is not yet a member of HA');
select is((select count(*)::int from public.people), 0, 'C sees no people before joining');
select throws_ok($q$select public.accept_invite('expired-token')$q$, 'P0001', 'invite_expired', 'an expired invite raises');
select throws_ok($q$select public.accept_invite('used-token')$q$, 'P0001', 'invite_used', 'a used invite raises');
select throws_ok($q$select public.accept_invite('no-such-token')$q$, 'P0001', 'invite_not_found', 'an unknown invite raises');
select throws_ok($q$select public.create_invite()$q$, 'P0001', 'not_owner', 'a user with no household cannot create invites');
select is((select public.accept_invite((select v from t_kv where k = 'TOKEN_A')))::text, (select v from t_kv where k = 'HA'), 'a valid invite joins C to HA');
select is((select count(*)::int from public.people), 2, 'C now sees HA''s people');
select is((select role from public.members where user_id = 'cccccccc-0000-4000-8000-00000000000c'), 'member', 'C joined as a member, not an owner');
select throws_ok($q$select public.create_invite()$q$, 'P0001', 'not_owner', 'a non-owner member cannot create invites');
select is((select count(*)::int from public.invites), 0, 'a non-owner member cannot read invites');
select throws_ok($q$select public.accept_invite('valid-2')$q$, 'P0001', 'already_in_household', 'C cannot accept a second invite');
select lives_ok($q$insert into public.people (household_id, name) values ((select v::uuid from t_kv where k = 'HA'), 'Added by C')$q$, 'a member can write household data');
update public.households set budget_cents = 12345 where id = (select v::uuid from t_kv where k = 'HA');
select is((select budget_cents from public.households), 12345, 'a member can update the household');
select lives_ok($q$update public.households set week_start = 'wed' where id = (select v::uuid from t_kv where k = 'HA')$q$, 'a member can set week_start to any day');
select throws_ok($q$update public.households set week_start = 'xyz' where id = (select v::uuid from t_kv where k = 'HA')$q$, '23514', null, 'an invalid week_start violates the check');

reset role;

select is((select used_by from public.invites where token = (select v from t_kv where k = 'TOKEN_A')), 'cccccccc-0000-4000-8000-00000000000c'::uuid, 'the accepted invite is marked used by C');
select is((select count(*)::int from public.ai_usage where household_id = (select v::uuid from t_kv where k = 'HA')), 2, 'A''s delete attempt left HA ai_usage intact');

-- ---------------------------------------------------------------------------
-- As anon: nothing at all
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null);

select throws_ok($q$select count(*) from public.people$q$, '42501', null, 'anon cannot read people');
select throws_ok($q$select count(*) from public.households$q$, '42501', null, 'anon cannot read households');
select throws_ok($q$select count(*) from public.invites$q$, '42501', null, 'anon cannot read invites');
select throws_ok($q$select public.create_household('Anon')$q$, '42501', null, 'anon cannot create a household');
select throws_ok($q$select public.accept_invite('valid-2')$q$, '42501', null, 'anon cannot accept an invite');
select throws_ok($q$select public.is_member(gen_random_uuid())$q$, '42501', null, 'anon cannot call is_member');
select is((select count(*)::int from storage.objects where bucket_id = 'meal-photos'), 0, 'anon sees no photos');
select throws_ok($q$insert into storage.objects (bucket_id, name) values ('meal-photos', 'x/y.jpg')$q$, '42501', null, 'anon cannot upload photos');

reset role;

-- ---------------------------------------------------------------------------
-- Spend guard (0003): non-negative usage, locked cap, ai_spend_since
-- ---------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');

select throws_ok($q$insert into public.ai_usage (household_id, kind, model, cost_cents) values ((select v::uuid from t_kv where k = 'HA'), 'parse', 'x', -5)$q$, '23514', null, 'a negative cost_cents row is rejected');
select throws_ok($q$insert into public.ai_usage (household_id, kind, model, input_tokens) values ((select v::uuid from t_kv where k = 'HA'), 'parse', 'x', -1)$q$, '23514', null, 'negative input_tokens is rejected');
select throws_ok($q$insert into public.ai_usage (household_id, kind, model, output_tokens) values ((select v::uuid from t_kv where k = 'HA'), 'parse', 'x', -1)$q$, '23514', null, 'negative output_tokens is rejected');
select throws_ok($q$update public.households set ai_cap_cents = 999999 where id = (select v::uuid from t_kv where k = 'HA')$q$, '42501', null, 'a member cannot change ai_cap_cents');
select is(public.ai_spend_since((select v::uuid from t_kv where k = 'HA'), '-infinity'), (select coalesce(sum(cost_cents), 0) from public.ai_usage where household_id = (select v::uuid from t_kv where k = 'HA')), 'ai_spend_since sums the own household usage');
select throws_ok($q$select public.ai_spend_since((select v::uuid from t_kv where k = 'HB'), '-infinity')$q$, 'P0001', 'not_member', 'ai_spend_since refuses another household');

reset role;
select pg_temp.act_as(null);
select throws_ok($q$select public.ai_spend_since(gen_random_uuid(), '-infinity')$q$, '42501', null, 'anon cannot call ai_spend_since');
reset role;

-- ---------------------------------------------------------------------------
-- Photo bucket limits (0005)
-- ---------------------------------------------------------------------------
select is((select file_size_limit from storage.buckets where id = 'meal-photos'), 5242880::bigint, 'meal-photos is capped at 5 MB');
select is((select allowed_mime_types from storage.buckets where id = 'meal-photos'), array['image/jpeg'], 'meal-photos accepts only JPEG');

select * from finish();
rollback;
