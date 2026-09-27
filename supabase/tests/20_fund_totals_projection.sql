-- private.fund_totals_plan / public.fund_totals_forecast
-- (20260927000001_fund_totals_projection.sql): a capped_percent fund's cap
-- must be checked against a PROJECTED running balance across the requested
-- window, not today's real checked balance repeated for every month - the
-- bug the month-by-month breakdown table would otherwise have shown (a
-- capped fund that looks like it keeps earning its percentage forever,
-- because every future month was checked against the same real balance).
--
-- ₱10,000/month leftover (single payday, no bills), one capped_percent fund
-- at 50%/cap ₱12,000, one 100% remainder fund absorbing the rest:
--   month 1: wants 5,000, room 12,000 -> gets 5,000 (running 5,000)
--   month 2: wants 5,000, room 7,000  -> gets 5,000 (running 10,000)
--   month 3: wants 5,000, room 2,000  -> gets 2,000 (running 12,000, capped)
--   month 4: wants 5,000, room 0      -> gets 0
-- The pre-fix code checked the cap against the real (checked) balance, which
-- is 0 for all four months here, so it would have given 5,000 every month.
--
-- Everything runs in one transaction and is rolled back.

begin;

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

delete from public.bill_items where category_id in (select id from public.categories where household_id = :'hid');
delete from public.ledger_entries where household_id = :'hid';
delete from public.categories where household_id = :'hid';
delete from public.incomes where household_id = :'hid';

insert into public.incomes (household_id, member_id, label, amount, recurring_day, active)
select :'hid', hm.id, 'PAY', 10000, 5, true
from public.household_members hm where hm.household_id = :'hid' and hm.user_id = :'leo_id';

insert into public.categories (household_id, kind, name, rule) values
  (:'hid', 'fund', 'EMERGENCY', '{"type":"capped_percent","percent":50,"cap":12000}'),
  (:'hid', 'fund', 'SAVINGS', '{"type":"remainder","percent":100}');

select id as emergency_id from public.categories where household_id = :'hid' and name = 'EMERGENCY' \gset
select id as savings_id from public.categories where household_id = :'hid' and name = 'SAVINGS' \gset

create function pg_temp.expect(p_label text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % was %, expected %', p_label, p_got, p_want;
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'leo_id', true);

select pg_temp.expect('capped_percent 4-month projection',
  (select plan::text from private.fund_totals_plan(:'hid', '2026-11-01', 4) where category_id = :'emergency_id'),
  '{5000,5000,2000,0}');

-- The remainder fund gets whatever the capped fund did not, every month.
select pg_temp.expect('remainder 4-month projection',
  (select plan::text from private.fund_totals_plan(:'hid', '2026-11-01', 4) where category_id = :'savings_id'),
  '{5000.00,5000.00,8000.00,10000.00}');

-- compute_monthly_fund_totals (p_months=1 wrapper) must still match plan[1].
select pg_temp.expect('single-month wrapper matches plan[1]',
  (select monthly_total::text from private.compute_monthly_fund_totals(:'hid', '2026-11-01') where category_id = :'emergency_id'),
  '5000');

-- The public RPC flattens the same plan into (category_id, month_index, amount).
select pg_temp.expect('public RPC month 3 matches the cap-limited amount',
  (select amount::text from public.fund_totals_forecast(:'hid', '2026-11-01', 4)
   where category_id = :'emergency_id' and month_index = 3),
  '2000');

-- A household the caller isn't a member of is rejected, same pattern as
-- public.goal_shortfalls.
do $$
begin
  perform 1 from public.fund_totals_forecast(gen_random_uuid(), '2026-11-01', 1);
  raise exception 'FAIL: fund_totals_forecast did not reject a foreign household';
exception
  when others then
    if sqlerrm not like 'not a member of household%' then
      raise;
    end if;
end;
$$;

reset role;
rollback;

select 'PASS: 20_fund_totals_projection' as result;
