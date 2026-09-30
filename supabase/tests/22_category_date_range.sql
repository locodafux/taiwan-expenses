-- Per-category start/end month (20260930000001_category_date_range.sql): a
-- category outside [start_month, end_month] gets no allocation row, no
-- forecast row and no bill schedule, and does not change the month's pool for
-- the categories that ARE in range. Rolled back at the end.

begin;

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

create function pg_temp.expect(p_label text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % was %, expected %', p_label, p_got, p_want;
  end if;
end;
$$;

-- Everything the seed created migrated to Oct 2026 / no end.
select pg_temp.expect('existing categories backfilled',
  (select count(*)::text from public.categories
   where household_id = :'hid' and (start_month <> '2026-10-01' or end_month is not null)), '0');

-- The range must be first-of-month and not inverted.
do $$
begin
  begin
    update public.categories set end_month = '2026-09-01' where id = (select id from public.categories limit 1);
    raise exception 'FAIL: end before start was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.categories set start_month = '2026-10-15' where id = (select id from public.categories limit 1);
    raise exception 'FAIL: mid-month start was accepted';
  exception when check_violation then null;
  end;
end;
$$;

delete from public.categories where household_id = :'hid';
insert into public.categories (household_id, kind, name, rule, sort_order, start_month, end_month) values
  (:'hid', 'bill', 'BILLS', null, 0, '2026-10-01', null),
  (:'hid', 'bill', 'LATE BILLS', null, 1, '2026-12-01', null),
  (:'hid', 'fund', 'SAVINGS', '{"type":"remainder","percent":50}', 1, '2026-10-01', '2027-01-01'),
  (:'hid', 'fund', 'EXTRA', '{"type":"remainder","percent":50}', 2, '2026-12-01', null);
insert into public.bill_items (category_id, label, amount, recurring_day, end_date)
select c.id, v.label, v.amount, v.day, null from (values
  ('BILLS', 'INTERNET', 1000, 15), ('LATE BILLS', 'GYM', 500, 15)
) v(cat, label, amount, day) join public.categories c on c.household_id = :'hid' and c.name = v.cat;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'leo_id', true);

-- Nov 2026: only SAVINGS and BILLS are in range. Pool = 58000 income - 1000 bill.
create temp table nov as
  select p.d, e.* from (values ('2026-11-05'::date), ('2026-11-15'), ('2026-11-20'), ('2026-11-30')) p(d),
  lateral public.preview_payday(:'hid', p.d) e;
select pg_temp.expect('Nov: no EXTRA row', (select count(*)::text from nov n join public.categories c on c.id = n.category_id where c.name = 'EXTRA'), '0');
select pg_temp.expect('Nov: no LATE BILLS row', (select count(*)::text from nov n join public.categories c on c.id = n.category_id where c.name = 'LATE BILLS'), '0');
select pg_temp.expect('Nov: BILLS row kept', (select count(*)::text from nov n join public.categories c on c.id = n.category_id where c.name = 'BILLS'), '1');
select pg_temp.expect('Nov: SAVINGS takes the whole pool',
  (select sum(n.amount)::int::text from nov n join public.categories c on c.id = n.category_id where c.name = 'SAVINGS'), '57000');

-- Dec 2026: EXTRA and LATE BILLS start. Pool = 58000 - 1000 - 500, split 50/50.
create temp table dec as
  select p.d, e.* from (values ('2026-12-05'::date), ('2026-12-15'), ('2026-12-20'), ('2026-12-30')) p(d),
  lateral public.preview_payday(:'hid', p.d) e;
select pg_temp.expect('Dec: LATE BILLS row', (select count(*)::text from dec n join public.categories c on c.id = n.category_id where c.name = 'LATE BILLS'), '1');
select pg_temp.expect('Dec: pool conserved',
  (select sum(n.amount)::int::text from dec n join public.categories c on c.id = n.category_id where c.kind = 'fund'), '56500');
select pg_temp.expect('Dec: EXTRA in range', (select (sum(n.amount) > 0)::text from dec n join public.categories c on c.id = n.category_id where c.name = 'EXTRA'), 'true');

-- Feb 2027: SAVINGS ended in Jan, so EXTRA alone takes the pool.
create temp table feb as
  select p.d, e.* from (values ('2027-02-05'::date), ('2027-02-15'), ('2027-02-20'), ('2027-02-28')) p(d),
  lateral public.preview_payday(:'hid', p.d) e;
select pg_temp.expect('Feb: no SAVINGS row', (select count(*)::text from feb n join public.categories c on c.id = n.category_id where c.name = 'SAVINGS'), '0');
select pg_temp.expect('Feb: EXTRA takes the whole pool',
  (select sum(n.amount)::int::text from feb n join public.categories c on c.id = n.category_id where c.name = 'EXTRA'), '56500');

-- Forecast: no row at all for a category in a month outside its range.
select pg_temp.expect('forecast: EXTRA only from Dec',
  (select min(f.month_index)::text from public.fund_totals_forecast(:'hid', '2026-10-01', 6) f
   join public.categories c on c.id = f.category_id where c.name = 'EXTRA'), '3');
select pg_temp.expect('forecast: SAVINGS stops after Jan',
  (select max(f.month_index)::text from public.fund_totals_forecast(:'hid', '2026-10-01', 8) f
   join public.categories c on c.id = f.category_id where c.name = 'SAVINGS'), '4');

-- materialize_payday writes nothing for out-of-range categories either.
select count(*) from public.materialize_payday(:'hid', '2026-11-15');
select pg_temp.expect('materialize: no EXTRA ledger row',
  (select count(*)::text from public.ledger_entries l join public.categories c on c.id = l.category_id
   where l.household_id = :'hid' and c.name in ('EXTRA', 'LATE BILLS')), '0');

reset role;
rollback;

select 'PASS: 22_category_date_range' as result;
