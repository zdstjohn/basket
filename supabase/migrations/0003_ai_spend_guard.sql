-- Spend guard: usage rows can never be negative, members cannot raise their own cap,
-- and the month's spend is summed in the database (the API caps a select at 1000 rows).
alter table public.ai_usage add constraint ai_usage_cost_nonneg check (cost_cents >= 0);
alter table public.ai_usage add constraint ai_usage_input_tokens_nonneg check (input_tokens >= 0);
alter table public.ai_usage add constraint ai_usage_output_tokens_nonneg check (output_tokens >= 0);

revoke update (ai_cap_cents) on public.households from authenticated;

create function public.ai_spend_since(h uuid, since timestamptz) returns numeric
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(h) then
    raise exception 'not_member';
  end if;
  return coalesce((
    select sum(u.cost_cents) from public.ai_usage u
    where u.household_id = h and u.created_at >= since
  ), 0);
end;
$$;

revoke execute on function public.ai_spend_since(uuid, timestamptz) from public, anon;
grant execute on function public.ai_spend_since(uuid, timestamptz) to authenticated;
