-- Row-level security tests for Basket (pgTAP).
-- Runs with `supabase test db` and also as one SQL call; everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(206);

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
  insert into public.kroger_matches (household_id, location_id, canonical, term)
    values (h, '70100001', 'milk', 'whole milk');
  insert into public.item_product_choice (household_id, canonical, upc)
    values (h, 'milk', '0001111041700');
  insert into public.price_observations (household_id, location_id, upc, regular_cents)
    values (h, '70100001', '0001111041700', 399);
  insert into public.cart_sends (household_id, week_id, user_id, modality)
    values (h, w, (select user_id from public.members where household_id = h limit 1), 'PICKUP');
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
-- Fred Meyer products and cart (0006)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');

select is((select count(*)::int from public.kroger_matches where household_id = (select v::uuid from t_kv where k = 'HA')), 1, 'A sees the HA kroger_matches row');
select is((select count(*)::int from public.item_product_choice where household_id = (select v::uuid from t_kv where k = 'HA')), 1, 'A sees the HA item_product_choice row');
select is((select count(*)::int from public.price_observations where household_id = (select v::uuid from t_kv where k = 'HA')), 1, 'A sees the HA price_observations row');
select is((select count(*)::int from public.cart_sends where household_id = (select v::uuid from t_kv where k = 'HA')), 1, 'A sees the HA cart_sends row');
select is((select count(*)::int from public.kroger_matches where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB kroger_matches');
select is((select count(*)::int from public.item_product_choice where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB item_product_choice');
select is((select count(*)::int from public.price_observations where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB price_observations');
select is((select count(*)::int from public.cart_sends where household_id = (select v::uuid from t_kv where k = 'HB')), 0, 'A sees no HB cart_sends');

select throws_ok($q$insert into public.kroger_matches (household_id, location_id, canonical, term) values ((select v::uuid from t_kv where k = 'HB'), '1', 'x', 'x')$q$, '42501', null, 'A cannot insert a kroger_matches row into HB');
select throws_ok($q$insert into public.item_product_choice (household_id, canonical, upc) values ((select v::uuid from t_kv where k = 'HB'), 'x', '0001111041700')$q$, '42501', null, 'A cannot insert an item_product_choice row into HB');
select throws_ok($q$insert into public.price_observations (household_id, location_id, upc, regular_cents) values ((select v::uuid from t_kv where k = 'HB'), '1', '0001111041700', 100)$q$, '42501', null, 'A cannot insert a price_observations row into HB');
select throws_ok($q$insert into public.cart_sends (household_id, week_id, modality) values ((select v::uuid from t_kv where k = 'HB'), (select v::uuid from t_kv where k = 'W_B'), 'PICKUP')$q$, '42501', null, 'A cannot insert a cart_sends row into HB');
select throws_ok($q$delete from public.kroger_matches$q$, '42501', null, 'A cannot delete kroger_matches');
select throws_ok($q$delete from public.cart_sends$q$, '42501', null, 'A cannot delete cart_sends');

-- kroger_links: private to the person.
select lives_ok($q$insert into public.kroger_links (sealed, profile_id) values ('sealed-a', 'prof-a')$q$, 'A can store a kroger link');
select is((select count(*)::int from public.kroger_links), 1, 'A reads its own kroger link');
select throws_ok($q$insert into public.kroger_links (user_id, sealed) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'x')$q$, '42501', null, 'A cannot store a link for B');

-- cart_sends: only the sender writes.
select throws_ok($q$insert into public.cart_sends (household_id, week_id, user_id, modality) values ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), 'cccccccc-0000-4000-8000-00000000000c', 'PICKUP')$q$, '42501', null, 'A cannot record a send as C');
select throws_ok($q$update public.cart_sends set profile_id = 'x'$q$, '42501', null, 'profile_id is not a granted column');
select lives_ok($q$insert into public.cart_sends (household_id, week_id, modality) values ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), 'DELIVERY')$q$, 'A can record its own send');
select throws_ok($q$insert into public.cart_sends (household_id, week_id, modality) values ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), 'DRONE')$q$, '23514', null, 'an unknown modality violates the check');
select lives_ok($q$update public.cart_sends set status = 'sent', total_cents = 500 where modality = 'DELIVERY'$q$, 'A can update its own send');

-- Spend guard for Kroger calls.
select is(public.kroger_spend((select v::uuid from t_kv where k = 'HA'), 5), 5, 'kroger_spend counts 5');
select is(public.kroger_spend((select v::uuid from t_kv where k = 'HA'), 5), 10, 'kroger_spend adds to today''s total');
select throws_ok($q$select public.kroger_spend((select v::uuid from t_kv where k = 'HB'), 1)$q$, 'P0001', 'not_member', 'kroger_spend refuses another household');
select throws_ok($q$select public.kroger_spend((select v::uuid from t_kv where k = 'HA'), 61)$q$, 'P0001', 'bad_count', 'kroger_spend refuses more than 60');
select throws_ok($q$select public.kroger_spend((select v::uuid from t_kv where k = 'HA'), -1)$q$, 'P0001', 'bad_count', 'kroger_spend refuses a negative count');
select throws_ok($q$insert into public.kroger_calls (household_id, day, calls) values ((select v::uuid from t_kv where k = 'HA'), '2000-01-01', 0)$q$, '42501', null, 'A cannot write kroger_calls');
select throws_ok($q$update public.kroger_calls set calls = 0$q$, '42501', null, 'A cannot reset kroger_calls');
select is((select calls from public.kroger_calls where household_id = (select v::uuid from t_kv where k = 'HA') and day = (now() at time zone 'utc')::date), 10, 'A can read its own call count');
select is(public.kroger_limited(), false, 'the all-households total is under the ceiling');
reset role;
update public.kroger_calls set calls = 395 where household_id = (select v::uuid from t_kv where k = 'HA');
update public.kroger_global_calls set calls = 395;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
select is(public.kroger_spend((select v::uuid from t_kv where k = 'HA'), 10), 395, 'at 395 a request for 10 adds nothing and returns the current total');
select is(public.kroger_spend((select v::uuid from t_kv where k = 'HA'), 5), 400, 'a request that reaches exactly 400 is allowed');
select is(public.kroger_spend((select v::uuid from t_kv where k = 'HA'), 1), 400, 'at 400 nothing more is added');
reset role;
select is((select calls from public.kroger_global_calls), 400, 'one household never pushes the global total past its own 400');
update public.kroger_calls set calls = 10 where household_id = (select v::uuid from t_kv where k = 'HA');
update public.kroger_global_calls set calls = 10;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');

-- Fulfillment and pack size.
update public.households set fulfillment = 'DELIVERY' where id = (select v::uuid from t_kv where k = 'HA');
select is((select fulfillment from public.households), 'DELIVERY', 'a member can set fulfillment');
select throws_ok($q$update public.households set fulfillment = 'DRONE' where id = (select v::uuid from t_kv where k = 'HA')$q$, '23514', null, 'an unknown fulfillment violates the check');
select throws_ok($q$update public.week_item_state set pack_count = 100$q$, '23514', null, 'pack_count above 99 violates the check');
select lives_ok($q$update public.week_item_state set pack_count = 3$q$, 'pack_count 3 is accepted');

-- Size limits.
select throws_ok($q$insert into public.kroger_links (user_id, sealed) values ('aaaaaaaa-0000-4000-8000-00000000000a', repeat('x', 4000)) on conflict (user_id) do update set sealed = excluded.sealed$q$, '23514', null, 'a sealed token of 4000 characters is refused');
select throws_ok($q$insert into public.kroger_matches (household_id, location_id, canonical, term, candidates) values ((select v::uuid from t_kv where k = 'HA'), '70100001', 'big', 'big', (select jsonb_agg(md5(i::text)) from generate_series(1, 4000) i))$q$, '23514', null, 'oversized candidates are refused');

reset role;

-- The ceiling flips above 8,000 (superuser sets up the total).
update public.kroger_global_calls set calls = 8001;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
select is(public.kroger_limited(), true, 'above 8,000 calls a day the ceiling reports limited');
reset role;

-- C is in HA: the link is private, the send is not C's to change.
select pg_temp.act_as('cccccccc-0000-4000-8000-00000000000c');
select is((select count(*)::int from public.kroger_links), 0, 'C cannot see A''s kroger link');
update public.kroger_links set sealed = 'x';
update public.cart_sends set status = 'failed';
select is((select count(*)::int from public.cart_sends where household_id = (select v::uuid from t_kv where k = 'HA')), 2, 'C sees HA''s sends');
reset role;
select is((select sealed from public.kroger_links where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 'sealed-a', 'C''s update left A''s link alone');
select is((select count(*)::int from public.cart_sends where status = 'failed'), 0, 'C''s update left A''s sends alone');

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.kroger_links), 0, 'B cannot see A''s kroger link');
reset role;

select pg_temp.act_as(null);
select throws_ok($q$select count(*) from public.kroger_links$q$, '42501', null, 'anon cannot read kroger_links');
select throws_ok($q$select public.kroger_spend(gen_random_uuid(), 1)$q$, '42501', null, 'anon cannot call kroger_spend');
select throws_ok($q$select public.kroger_limited()$q$, '42501', null, 'anon cannot call kroger_limited');
reset role;


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
-- One spend guard for every paid call (0008): ai_gate, trusted, the untrusted Kroger pool
-- ---------------------------------------------------------------------------
reset role;
-- The local database may hold other untrusted usage from today: lift the pool so only the pool test hits it.
update public.spend_limits set untrusted_day_cents = 1000000000;
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
insert into t_kv select 'HD', public.create_household('Delta family')::text;
reset role;
select is((select ai_cap_cents from public.households where id = (select v::uuid from t_kv where k = 'HD')), 50, 'a new household starts with a 50 cent AI cap');
select is((select trusted from public.households where id = (select v::uuid from t_kv where k = 'HD')), false, 'a new household is not trusted');

select pg_temp.act_as(null);
select throws_ok($q$select public.ai_gate(gen_random_uuid(), 1)$q$, '42501', null, 'anon cannot call ai_gate');
select throws_ok($q$select public.create_invite()$q$, '42501', null, 'anon cannot call create_invite');
reset role;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HB'), 1), 'not_member', 'ai_gate refuses a household the caller is not in');
select throws_ok($q$select public.ai_gate((select v::uuid from t_kv where k = 'HA'), -1)$q$, 'P0001', 'bad_hold', 'ai_gate refuses a negative hold');
select throws_ok($q$update public.households set trusted = true where id = (select v::uuid from t_kv where k = 'HA')$q$, '42501', null, 'a member cannot make their own household trusted');
select throws_ok($q$select * from public.spend_limits$q$, '42501', null, 'members cannot read spend_limits');
reset role;

-- With 1 cent left: the first call holds it, the second is refused, and no real usage row appears.
update public.households set ai_cap_cents = 10 where id = (select v::uuid from t_kv where k = 'HB');
delete from public.ai_usage where household_id = (select v::uuid from t_kv where k = 'HB');
insert into public.ai_usage (household_id, kind, model, cost_cents) values ((select v::uuid from t_kv where k = 'HB'), 'parse', 'test', 9);
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-00000000000b');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HB'), 1), 'ok', 'with 1 cent left the first call is ok');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HB'), 1), 'cap', 'the second call is over the cap (the hold counts)');
select is((select count(*)::int from public.ai_usage where household_id = (select v::uuid from t_kv where k = 'HB') and kind <> 'hold'), 1, 'the gate wrote no real usage row');
select throws_ok($q$delete from public.ai_usage$q$, '42501', null, 'a member cannot erase a hold');
reset role;
select is((select count(*)::int from public.ai_usage where household_id = (select v::uuid from t_kv where k = 'HB') and kind = 'hold'), 1, 'exactly one hold was made');
update public.ai_usage set created_at = now() - interval '91 seconds' where household_id = (select v::uuid from t_kv where k = 'HB') and kind = 'hold';
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-00000000000b');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HB'), 1), 'ok', 'a hold 91 seconds old is no longer counted');
reset role;

-- Rate: per minute, then per day. D's zone is also unknown to Postgres: it falls back to Pacific.
update public.spend_limits set per_minute = 2;
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HD'), 1), 'ok', 'per_minute: first call ok');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HD'), 1), 'ok', 'per_minute: second call ok');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HD'), 1), 'slow', 'per_minute: the third call in a minute is slow');
reset role;
update public.spend_limits set per_minute = 20, per_day = 2;
update public.ai_usage set created_at = greatest(date_trunc('day', now() at time zone 'utc') at time zone 'utc', now() - interval '5 minutes')
  where household_id = (select v::uuid from t_kv where k = 'HD') and kind = 'hold';
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HD'), 1), 'slow', 'per_day: two holds today is the daily limit');
reset role;
update public.spend_limits set per_day = 300;
-- A name Postgres does not list can only be an old row now (a trigger refuses new ones): plant one.
set local session_replication_role = replica;
update public.households set time_zone = 'nonsense' where id = (select v::uuid from t_kv where k = 'HD');
set local session_replication_role = origin;
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HD'), 1), 'ok', 'an unknown time zone falls back instead of failing');
reset role;

-- The untrusted pool: busy for an untrusted household, ok for a trusted one.
update public.households set ai_cap_cents = 2000000000 where id = (select v::uuid from t_kv where k = 'HA');
update public.spend_limits set untrusted_day_cents = 1 + (
  select coalesce(sum(u.cost_cents), 0) from public.ai_usage u join public.households x on x.id = u.household_id
  where not x.trusted and u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc' and u.created_at <= now()
    and (u.kind <> 'hold' or u.created_at > now() - interval '90 seconds'));
insert into public.ai_usage (household_id, kind, model, cost_cents) values ((select v::uuid from t_kv where k = 'HA'), 'parse', 'test', 5);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HA'), 1), 'busy', 'untrusted pool full: busy for an untrusted household');
reset role;
update public.households set trusted = true where id = (select v::uuid from t_kv where k = 'HA');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HA'), 1), 'ok', 'untrusted pool full: ok for a trusted household');
reset role;

-- Spoonacular searches count: strangers fill the shared pool with them, and then get busy; a trusted one searches on.
update public.households set trusted = false where id = (select v::uuid from t_kv where k = 'HA');
update public.spend_limits set untrusted_day_cents = 1 + (
  select coalesce(sum(u.cost_cents), 0) from public.ai_usage u join public.households x on x.id = u.household_id
  where not x.trusted and u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc' and u.created_at <= now()
    and (u.kind <> 'hold' or u.created_at > now() - interval '90 seconds'));
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select lives_ok($q$insert into public.ai_usage (household_id, kind, model, cost_cents) values ((select v::uuid from t_kv where k = 'HD'), 'search', 'spoonacular', 0.5), ((select v::uuid from t_kv where k = 'HD'), 'search', 'spoonacular', 0.5)$q$, 'a member records two Spoonacular searches');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HD'), 1), 'busy', 'two Spoonacular searches fill the untrusted pool: busy');
reset role;
update public.households set trusted = true where id = (select v::uuid from t_kv where k = 'HA');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HA'), 1), 'ok', 'a trusted household still gets through the full pool');
reset role;
update public.spend_limits set untrusted_day_cents = 1000000000;
update public.households set trusted = false where id = (select v::uuid from t_kv where k = 'HD');

-- Members cannot choose created_at or id, and a future-dated row counts for nothing.
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select throws_ok($q$insert into public.ai_usage (household_id, kind, model, created_at) values ((select v::uuid from t_kv where k = 'HD'), 'parse', 'x', now() + interval '1 day')$q$, '42501', null, 'a member cannot set created_at on a usage row');
select throws_ok($q$insert into public.ai_usage (id, household_id, kind, model) values (gen_random_uuid(), (select v::uuid from t_kv where k = 'HD'), 'parse', 'x')$q$, '42501', null, 'a member cannot set the id of a usage row');
reset role;
update public.spend_limits set untrusted_day_cents = 1 + (
  select coalesce(sum(u.cost_cents), 0) from public.ai_usage u join public.households x on x.id = u.household_id
  where not x.trusted and u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc' and u.created_at <= now()
    and (u.kind <> 'hold' or u.created_at > now() - interval '90 seconds'));
insert into public.ai_usage (household_id, kind, model, cost_cents, created_at) values ((select v::uuid from t_kv where k = 'HD'), 'parse', 'test', 50, now() + interval '1 day');
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HD'), 1), 'ok', 'a future-dated row does not count toward the pool');
reset role;
update public.spend_limits set untrusted_day_cents = 1000000000;

-- A direct call cannot hold more than 5 cents.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HA'), 100), 'ok', 'a big hold is accepted');
reset role;
select is((select count(*)::int from public.ai_usage where household_id = (select v::uuid from t_kv where k = 'HA') and kind = 'hold' and cost_cents = 5), 1, 'and clamped to 5 cents');

-- One row cannot cost more than 50 cents, so one inserted row cannot fill the shared pool.
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select throws_ok($q$insert into public.ai_usage (household_id, kind, model, cost_cents) values ((select v::uuid from t_kv where k = 'HD'), 'parse', 'x', 51)$q$, '23514', null, 'a usage row over 50 cents is refused');
reset role;
select ok(not has_function_privilege('anon', 'public.households_check_time_zone()', 'execute') and not has_function_privilege('authenticated', 'public.households_check_time_zone()', 'execute') and not has_function_privilege('public', 'public.households_check_time_zone()', 'execute'), 'nobody can call the time zone trigger function directly');

-- Trusted households get the higher rate limits.
delete from public.ai_usage where household_id = (select v::uuid from t_kv where k = 'HB') and kind = 'hold';
update public.households set trusted = true, ai_cap_cents = 2000000000 where id = (select v::uuid from t_kv where k = 'HB');
update public.spend_limits set per_minute = 1, trusted_per_minute = 2;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-00000000000b');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HB'), 1), 'ok', 'trusted per_minute: first call ok');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HB'), 1), 'ok', 'trusted per_minute: the second is ok where an untrusted household would be slow');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HB'), 1), 'slow', 'trusted per_minute: the third is slow');
reset role;
update public.spend_limits set per_minute = 20, trusted_per_minute = 60;

-- A time zone Postgres does not list cannot be stored.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a');
select throws_ok($q$update public.households set time_zone = 'nonsense' where id = (select v::uuid from t_kv where k = 'HA')$q$, '23514', null, 'a member cannot set an unknown time zone');
select lives_ok($q$update public.households set time_zone = 'Europe/Paris' where id = (select v::uuid from t_kv where k = 'HA')$q$, 'a listed time zone is accepted');
reset role;

-- No spend_limits row means the defaults, not no limits.
delete from public.spend_limits;
-- (trusted, so the answer does not depend on how much untrusted usage the local database holds today)
update public.households set trusted = true where id = (select v::uuid from t_kv where k = 'HD');
update public.ai_usage set created_at = now() - interval '2 days' where household_id = (select v::uuid from t_kv where k = 'HD') and kind = 'hold';
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select is(public.ai_gate((select v::uuid from t_kv where k = 'HD'), 1), 'ok', 'with no spend_limits row ai_gate still answers, on the defaults');
reset role;
insert into public.spend_limits default values;
update public.spend_limits set untrusted_day_cents = 1000000000;
update public.households set trusted = false where id = (select v::uuid from t_kv where k = 'HD');

-- The untrusted Kroger pool (600 a day for all untrusted households together).
update public.kroger_global_calls set untrusted_calls = 598 where day = (now() at time zone 'utc')::date;
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select is(public.kroger_spend((select v::uuid from t_kv where k = 'HD'), 3), 0, 'Kroger pool: 3 more past 598 is refused, the household total is unchanged');
select is(public.kroger_spend((select v::uuid from t_kv where k = 'HD'), 2), 2, 'Kroger pool: exactly 600 is allowed');
select is(public.kroger_spend((select v::uuid from t_kv where k = 'HD'), 1), 2, 'Kroger pool: full, nothing more is added');
reset role;
update public.households set trusted = true where id = (select v::uuid from t_kv where k = 'HD');
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d');
select is(public.kroger_spend((select v::uuid from t_kv where k = 'HD'), 1), 3, 'Kroger pool: a trusted household is not held by it');
reset role;
select is((select untrusted_calls from public.kroger_global_calls where day = (now() at time zone 'utc')::date), 600, 'a trusted household adds nothing to the untrusted pool');

-- Every table in public has row-level security, and none is granted to anon or PUBLIC.
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), 0, 'every table in public has row-level security');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace,
  lateral aclexplode(c.relacl) a
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and a.grantee in (0, (select oid from pg_roles where rolname = 'anon'))), 0, 'no table in public is granted to anon or PUBLIC');

-- ---------------------------------------------------------------------------
-- Photo bucket limits (0005)
-- ---------------------------------------------------------------------------
select is((select file_size_limit from storage.buckets where id = 'meal-photos'), 5242880::bigint, 'meal-photos is capped at 5 MB');
select is((select allowed_mime_types from storage.buckets where id = 'meal-photos'), array['image/jpeg'], 'meal-photos accepts only JPEG');

-- Migration 0007: old 'food#kind' flag rows fold into one row per food (the statement is repeated here,
-- since migrations have already run by now).
reset role;
insert into public.week_item_state (household_id, week_id, item_key, have_it) values
  ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), 'beans#mass', true);
insert into public.week_item_state (household_id, week_id, item_key, checked) values
  ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), 'beans#count:can', true);
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
select is((select count(*)::int from public.week_item_state where item_key like 'beans%'), 1, '0007 folds the old beans rows into one row');
select ok((select have_it and checked from public.week_item_state where item_key = 'beans'), '0007 keeps both flags on the folded beans row');
select is((select count(*)::int from public.week_item_state where item_key like '%#%'), 0, '0007 leaves no row keyed food#kind');

-- 0016: tidy stored food names (NFC, collapsed spaces, trimmed, lower case); a clash keeps the newest row.
insert into public.always_have (household_id, canonical, created_at) values
  ((select v::uuid from t_kv where k = 'HA'), E'Olive   Oil ', now() - interval '2 days'),
  ((select v::uuid from t_kv where k = 'HA'), 'olive oil', now() - interval '1 day'),
  ((select v::uuid from t_kv where k = 'HA'), E'jalapen\u0303o', now());
insert into public.item_product_choice (household_id, canonical, search_term, updated_at) values
  ((select v::uuid from t_kv where k = 'HA'), E'black  pepper', 'old words', now() - interval '3 days'),
  ((select v::uuid from t_kv where k = 'HA'), 'black pepper', 'new words', now() - interval '1 day');
insert into public.item_product_choice (household_id, canonical, search_term, updated_at) values
  ((select v::uuid from t_kv where k = 'HA'), E'brown  sugar', 'kept words', now()),
  ((select v::uuid from t_kv where k = 'HA'), 'brown sugar', 'older words', now() - interval '5 days');
insert into public.week_item_state (household_id, week_id, item_key, have_it) values
  ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), E'Sea  Salt', true);
insert into public.item_product_choice (household_id, canonical, upc, search_term, updated_at) values
  ((select v::uuid from t_kv where k = 'HA'), E'red  lentils', '1111111111111', 'old lentils', now() - interval '4 days'),
  ((select v::uuid from t_kv where k = 'HA'), 'red lentils', null, null, now());
insert into public.week_item_state (household_id, week_id, item_key, have_it, checked, outside_budget, pack_count, created_at) values
  ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), E'oat  milk', true, false, false, 3, now() - interval '2 days'),
  ((select v::uuid from t_kv where k = 'HA'), (select v::uuid from t_kv where k = 'W_A'), 'oat milk', false, true, false, null, now());
insert into public.item_product_choice (household_id, canonical, upc, search_term, updated_at) values
  ((select v::uuid from t_kv where k = 'HA'), E'black  beans', '1231231231231', null, now() - interval '2 days'),
  ((select v::uuid from t_kv where k = 'HA'), 'black beans', null, 'organic black beans', now());
select public.tidy_food_names();
select is((select count(*)::int from public.always_have where canonical = 'olive oil' and household_id = (select v::uuid from t_kv where k = 'HA')), 1, '0016 merges the two olive oil rows into one');
select is((select count(*)::int from public.always_have where canonical = E'jalape\u00f1o'), 1, '0016 rewrites an NFD name as NFC');
select is((select count(*)::int from public.always_have where canonical <> public.tidy_food(canonical)), 0, '0016 leaves no untidy always_have name');
select is((select search_term from public.item_product_choice where canonical = 'black pepper' and household_id = (select v::uuid from t_kv where k = 'HA')), 'new words', '0016 keeps the newest row when names clash (tidy row newer)');
select is((select search_term from public.item_product_choice where canonical = 'brown sugar' and household_id = (select v::uuid from t_kv where k = 'HA')), 'kept words', '0016 keeps the newest row when names clash (untidy row newer)');
select is((select have_it from public.week_item_state where item_key = 'sea salt'), true, '0016 tidies a week_item_state key');
create temp table t_tidy_before as
  select (select count(*) from public.always_have) a, (select count(*) from public.item_product_choice) c, (select count(*) from public.week_item_state) w,
         (select string_agg(canonical, ',' order by canonical) from public.always_have) names;
select public.tidy_food_names();
select is((select upc from public.item_product_choice where canonical = 'red lentils' and household_id = (select v::uuid from t_kv where k = 'HA')), '1111111111111', '0016 keeps a chosen product when the newest row has none');
select is((select search_term from public.item_product_choice where canonical = 'red lentils' and household_id = (select v::uuid from t_kv where k = 'HA')), 'old lentils', '0016 keeps the wording when the newest row has none');
select is((select search_term from public.item_product_choice where canonical = 'black beans' and household_id = (select v::uuid from t_kv where k = 'HA')), 'organic black beans', '0016 keeps a newer search wording');
select is((select upc from public.item_product_choice where canonical = 'black beans' and household_id = (select v::uuid from t_kv where k = 'HA')), null, '0016 does not bring back a product a newer search cleared');
select is((select count(*)::int from public.week_item_state where item_key = 'oat milk'), 1, '0016 folds two oat milk rows into one');
select ok((select have_it and checked and not outside_budget and pack_count = 3 from public.week_item_state where item_key = 'oat milk'), '0016 keeps every tick and the pack count when folding');
select ok((select a = (select count(*) from public.always_have) and c = (select count(*) from public.item_product_choice)
                  and w = (select count(*) from public.week_item_state)
                  and names = (select string_agg(canonical, ',' order by canonical) from public.always_have) from t_tidy_before),
          '0016 run twice changes nothing');

select * from finish();
rollback;
