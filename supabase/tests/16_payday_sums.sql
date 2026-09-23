-- Every payday's checklist adds up to its take-home
-- (20260923000020_short_payday_carry.sql; in-app bug report 2026-09-23).
--
-- The reporter's own household: ₱20,000/₱9,000/₱20,000/₱9,000 paid on the
-- 5th/15th/20th/30th (the seed incomes), her bills, and three funds (a 20%
-- remainder Savings, a ₱200,000 Emergency goal, a one-time ₱80,000 Taiwan trip
-- due Feb 2027). Until MACBOOK's last payment (Oct 15) the 15th is ₱1,700
-- short, and the 5th keeps that ₱1,700 for it; every other payday puts all of
-- its leftover into funds. So for every payday:
--   Σ its ledger rows = its income − what it keeps for another payday
--                                  + what another payday kept for it.
-- Everything runs in one transaction and is rolled back.

begin;

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

delete from public.categories where household_id = :'hid';
insert into public.categories (household_id, kind, name, rule) values
  (:'hid', 'bill', 'BILLS', null), (:'hid', 'bill', 'LOAN', null), (:'hid', 'bill', 'EXPENSES', null),
  (:'hid', 'fund', 'SAVINGS', '{"type":"remainder","percent":20,"target_amount":0}'),
  (:'hid', 'fund', 'EMERGENCY FUND', '{"type":"goal","target_amount":200000}'),
  (:'hid', 'fund', 'TAIWAN FUND', '{"type":"goal","one_time":true,"target_amount":80000,"target_date":"2027-02-01"}');
insert into public.bill_items (category_id, label, amount, recurring_day, end_date)
select c.id, v.label, v.amount, v.day, v.end_date::date from (values
  ('EXPENSES', 'JEEP', 840, 5, null), ('EXPENSES', 'LEO MED', 500, 5, null), ('EXPENSES', 'MILDRED MED', 1500, 5, null),
  ('EXPENSES', 'MOVE IT', 1420, 5, null), ('EXPENSES', 'BUS', 360, 5, null), ('EXPENSES', 'FOOD', 5000, 5, null),
  ('LOAN', 'ATOME', 3000, 5, null),
  ('BILLS', 'INTERNET', 1000, 15, null), ('BILLS', 'WATER', 1500, 15, null), ('EXPENSES', 'MILDRED MED', 1500, 15, null),
  ('LOAN', 'SHOPPEE', 3000, 15, '2026-11-15'), ('LOAN', 'MACBOOK', 3700, 15, '2026-10-15'),
  ('BILLS', 'TINKANG NET', 1700, 20, null), ('EXPENSES', 'JEEP', 840, 20, null), ('EXPENSES', 'FOOD', 5000, 20, null),
  ('EXPENSES', 'CLAUDE', 1500, 20, null), ('EXPENSES', 'NETFLIX', 600, 20, null), ('EXPENSES', 'LOAD', 300, 20, null),
  ('EXPENSES', 'MOVE IT', 1420, 20, null), ('EXPENSES', 'BUS', 360, 20, null), ('LOAN', 'NANO', 2620, 20, '2027-02-20'),
  ('BILLS', 'ELECTRICITY', 1500, 30, null), ('BILLS', 'HOUSE', 4000, 30, null), ('LOAN', 'SLOAN', 1020, 30, '2026-09-30')
) v(cat, label, amount, day, end_date) join public.categories c on c.household_id = :'hid' and c.name = v.cat;

create function pg_temp.expect(p_label text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % was %, expected %', p_label, p_got, p_want;
  end if;
end;
$$;

-- Materializes every payday of p_month and checks each one's rows add up.
create function pg_temp.check_month(p_hid uuid, p_month date)
returns void language plpgsql as $$
declare
  d date;
  v_got numeric;
  v_want numeric;
begin
  foreach d in array private.household_paydays_in_month(p_hid, p_month) loop
    perform public.materialize_payday(p_hid, d);
    select coalesce(sum(amount), 0) into v_got from public.ledger_entries where payday_date = d;
    select sum(amount) into v_want from public.incomes
      where household_id = p_hid and active and recurring_day = extract(day from d);
    select v_want
      - coalesce(sum(c.amount) filter (where c.from_payday = d), 0)
      + coalesce(sum(c.amount) filter (where c.to_payday = d and c.from_payday is not null), 0)
      into v_want from public.payday_carries(p_hid, d) c;
    if v_got <> v_want then
      raise exception 'FAIL: payday % rows add up to %, expected %', d, v_got, v_want;
    end if;
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'leo_id', true);

-- The short 15th is covered by the 5th, before the day it is needed.
select pg_temp.expect('September carries',
  (select string_agg(from_payday || '>' || to_payday || '=' || amount::int, ',')
   from public.payday_carries(:'hid', '2026-09-30')),
  '2026-09-05>2026-09-15=1700');

select pg_temp.check_month(:'hid', '2026-09-01');
select pg_temp.check_month(:'hid', '2026-10-01');
select pg_temp.check_month(:'hid', '2026-11-01');

-- The reported payday: ₱9,000 take-home, ₱6,520 of bills, ₱2,480 to Taiwan
-- (it used to show ₱8,728 in total - ₱272 held back with no row saying so).
select pg_temp.expect('Sep 30 funds',
  (select string_agg(c.name || '=' || le.amount::int, ',' order by c.name)
   from public.ledger_entries le join public.categories c on c.id = le.category_id
   where le.payday_date = '2026-09-30' and c.kind = 'fund'),
  'EMERGENCY FUND=0,SAVINGS=0,TAIWAN FUND=2480');

-- November has no short payday: nothing carried, every payday stands alone.
select pg_temp.expect('November carries',
  (select count(*)::text from public.payday_carries(:'hid', '2026-11-01')), '0');

reset role;
rollback;

select 'PASS: 16_payday_sums' as result;
