-- private.group_child_goal_shortfalls (20261004000001): a linked fund's
-- "complete by" month counts as a month it can still be funded in, and money
-- already ticked off THIS month is not subtracted from what is left (this
-- month's full pool is still counted as coming), so a short plan keeps a steady
-- shortfall as its paydays are ticked.
--
-- ₱10,000/month pool, one child taking 50% (₱5,000/month), deadline Dec 2026
-- seen from Oct 2026 = Oct + Nov + Dec = ₱15,000.
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

insert into public.categories (household_id, kind, name, sort_order, rule, is_group_parent)
values (:'hid', 'fund', 'Pool', 1, '{"type":"remainder","percent":100}', true);
select id as pool_id from public.categories where household_id = :'hid' and name = 'Pool' \gset

-- Fits exactly (15,000 over Oct-Dec) and falls ₱5,000 short (20,000).
insert into public.categories (household_id, kind, name, sort_order, rule)
select :'hid', 'fund', n, s, jsonb_build_object('type', 'group_child', 'parent_id', :'pool_id'::uuid, 'percent', 50,
  'goal', jsonb_build_object('target_amount', t, 'target_date', '2026-12-01'))
from (values ('Fits', 10, 15000), ('Short', 11, 20000)) v(n, s, t);
select id as fits_id from public.categories where household_id = :'hid' and name = 'Fits' \gset
select id as short_id from public.categories where household_id = :'hid' and name = 'Short' \gset

create function pg_temp.expect(p_label text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % was %, expected %', p_label, p_got, p_want;
  end if;
end;
$$;

create function pg_temp.gap(p_cat uuid, p_month date)
returns text language sql as $$
  select shortfall::int::text from private.group_child_goal_shortfalls((select household_id from public.categories where id = p_cat), p_month)
  where category_id = p_cat;
$$;

-- Nothing ticked: the deadline month counts, so 'Fits' has no gap; 'Short' is ₱5,000 short.
select pg_temp.expect('deadline month counts', pg_temp.gap(:'fits_id', '2026-10-01'), '0');
select pg_temp.expect('true shortfall', pg_temp.gap(:'short_id', '2026-10-01'), '5000');

-- Ticking this month's paydays changes nothing: the October pool is still counted as coming.
insert into public.ledger_entries (category_id, payday_date, amount, status, checked_at)
values (:'fits_id', '2026-10-05', 5000, 'checked', now()), (:'short_id', '2026-10-05', 5000, 'checked', now());
select pg_temp.expect('ticked this month, plan fits', pg_temp.gap(:'fits_id', '2026-10-01'), '0');
select pg_temp.expect('ticked this month, shortfall steady', pg_temp.gap(:'short_id', '2026-10-01'), '5000');

-- Next month the October money is history: Nov + Dec = 10,000 more.
select pg_temp.expect('next month, plan fits', pg_temp.gap(:'fits_id', '2026-11-01'), '0');
select pg_temp.expect('next month, shortfall steady', pg_temp.gap(:'short_id', '2026-11-01'), '5000');

rollback;

select 'PASS: 26_group_child_shortfall_deadline' as result;
