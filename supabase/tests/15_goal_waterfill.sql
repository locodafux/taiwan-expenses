-- Goal tier water-filling and one-time goals (20260921000050_goal_waterfill.sql),
-- plus the emergency-fund cap flowing 5:2 into Savings/Excess.
--
-- Uses the seed household (₱58,000 income a month), planning from Dec 2026.
-- Its bills are retired and replaced by one ₱28,000 rent, so every month has
-- ₱30,000 of room; a "lean December" bill of ₱20,000 due the 20th, ending
-- 2026-12-31, drops December alone to ₱10,000.
-- Everything runs in one transaction and is rolled back.

begin;

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

-- Start from a clean goal tier: no seeded Taiwan Fund.
update public.categories set archived = true where household_id = :'hid' and rule ->> 'type' = 'goal';

create temp table lean_bill as
  select c.id as category_id from public.categories c
  where c.household_id = :'hid' and c.kind = 'bill' limit 1;
update public.bill_items set end_date = '2026-11-30' where household_id = :'hid';
insert into public.bill_items (category_id, label, amount, recurring_day)
  select category_id, 'Rent', 28000, 5 from lean_bill;

create function pg_temp.goal(p_name text, p_amount numeric, p_due date, p_one_time bool, p_sort int)
returns uuid language sql as $$
  insert into public.categories (household_id, kind, name, sort_order, rule)
  select household_id, 'fund', p_name, p_sort,
    jsonb_build_object('type', 'goal', 'target_amount', p_amount, 'target_date', p_due, 'one_time', p_one_time)
  from public.household_members where user_id = (select id from auth.users where email = 'leo@example.com')
  returning id;
$$;

create function pg_temp.plan(p_id uuid)
returns text language sql as $$
  select gp.plan::int[]::text || ' short ' || gp.shortfall::int
  from public.household_members hm, private.goal_plan(hm.household_id, '2026-12-01') gp
  where hm.user_id = (select id from auth.users where email = 'leo@example.com') and gp.category_id = p_id;
$$;

create function pg_temp.expect(p_label text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % was %, expected %', p_label, p_got, p_want;
  end if;
end;
$$;

-- water_fill building block.
select pg_temp.expect('water_fill even split', private.water_fill(10, array[3, 3, 3, 3])::text, '{2,3,2,3}');
select pg_temp.expect('water_fill lean month', private.water_fill(100, array[10, 50, 50])::text, '{10,45,45}');
select pg_temp.expect('water_fill not enough room', private.water_fill(100, array[10, 20, 0])::text, '{10,20,0}');

-- 1. A trip only one month can absorb: ₱20,000 due Feb (window Dec-Jan), and
--    lean December can't cover it, so January takes the whole cost.
savepoint s;
insert into public.bill_items (category_id, label, amount, recurring_day, end_date)
  select category_id, 'Lean December', 20000, 20, '2026-12-31' from lean_bill;
select pg_temp.goal('Trip', 20000, '2027-02-10', true, 10) as trip \gset
select pg_temp.expect('one-month trip', pg_temp.plan(:'trip'), '{0,20000} short 0');
rollback to savepoint s;

-- 2. A trip no single month can cover: ₱35,000 due Feb with lean December
--    splits across both months and is still fully funded.
savepoint s;
insert into public.bill_items (category_id, label, amount, recurring_day, end_date)
  select category_id, 'Lean December', 20000, 20, '2026-12-31' from lean_bill;
select pg_temp.goal('Trip', 35000, '2027-02-10', true, 10) as trip \gset
select pg_temp.expect('two-month trip', pg_temp.plan(:'trip'), '{10000,25000} short 0');
rollback to savepoint s;

-- 3. More than the window can hold: ₱45,000 funds all it can and reports the
--    ₱5,000 gap, which goal_shortfalls() surfaces to the checklist.
savepoint s;
insert into public.bill_items (category_id, label, amount, recurring_day, end_date)
  select category_id, 'Lean December', 20000, 20, '2026-12-31' from lean_bill;
select pg_temp.goal('Trip', 45000, '2027-02-10', true, 10) as trip \gset
select pg_temp.expect('short trip', pg_temp.plan(:'trip'), '{10000,30000} short 5000');
set local role authenticated;
select set_config('request.jwt.claim.sub', :'leo_id', true);
select pg_temp.expect('goal_shortfalls',
  (select string_agg(shortfall::int::text, ',') from public.goal_shortfalls(:'hid', '2026-12-05')), '5000');
reset role;
rollback to savepoint s;

-- 4. A deadline goal with a lean month: ₱50,000 due Mar (window Dec-Feb).
--    Flat share 16,667 is more than December has, so December gives its
--    ₱10,000 and drops out; January and February each rise to ₱20,000.
savepoint s;
insert into public.bill_items (category_id, label, amount, recurring_day, end_date)
  select category_id, 'Lean December', 20000, 20, '2026-12-31' from lean_bill;
select pg_temp.goal('Taiwan', 50000, '2027-03-05', false, 1) as taiwan \gset
select pg_temp.expect('deadline goal', pg_temp.plan(:'taiwan'), '{10000,20000,20000} short 0');
rollback to savepoint s;

-- 5. One-time goals go first even when sorted after a deadline goal: the
--    ₱20,000 trip lands in December (earliest month with room), leaving
--    December ₱10,000 for Taiwan, which water-fills the same as case 4.
savepoint s;
select pg_temp.goal('Taiwan', 50000, '2027-03-05', false, 1) as taiwan \gset
select pg_temp.goal('Trip', 20000, '2027-02-10', true, 10) as trip \gset
select pg_temp.expect('ordered trip', pg_temp.plan(:'trip'), '{20000,0} short 0');
select pg_temp.expect('ordered taiwan', pg_temp.plan(:'taiwan'), '{10000,20000,20000} short 0');
select pg_temp.expect('december totals',
  (select monthly_total::int::text from private.compute_monthly_fund_totals(:'hid', '2026-12-01') where category_id = :'trip'), '20000');
rollback to savepoint s;

-- 6. Emergency fund cap: with ₱99,000 already saved, its 30% (₱9,000 of
--    ₱30,000) is cut to the ₱1,000 of room left, and the rest flows 5:2 to
--    Savings/Excess: Savings round(29000 * 5/7) = 20714, Excess 8286.
savepoint s;
insert into public.ledger_entries (category_id, payday_date, amount, status, checked_at)
  select c.id, '2026-11-20', 99000 - coalesce((select sum(amount) from public.ledger_entries
    where category_id = c.id and status = 'checked'), 0), 'checked', now()
  from public.categories c where c.household_id = :'hid' and c.name = 'Emergency Fund';
select pg_temp.expect('capped split',
  (select string_agg(c.name || '=' || t.monthly_total::int, ',' order by c.sort_order)
   from private.compute_monthly_fund_totals(:'hid', '2026-12-01') t join public.categories c on c.id = t.category_id),
  'Emergency Fund=1000,Savings=20714,Excess=8286');
-- Once full, nothing more goes in and all of it splits 5:2.
insert into public.ledger_entries (category_id, payday_date, amount, status, checked_at)
  select id, '2026-11-21', 1000, 'checked', now() from public.categories
  where household_id = :'hid' and name = 'Emergency Fund';
select pg_temp.expect('full emergency split',
  (select string_agg(c.name || '=' || t.monthly_total::int, ',' order by c.sort_order)
   from private.compute_monthly_fund_totals(:'hid', '2026-12-01') t join public.categories c on c.id = t.category_id),
  'Emergency Fund=0,Savings=21429,Excess=8571');
rollback to savepoint s;

rollback;

select 'PASS: 15_goal_waterfill' as result;
