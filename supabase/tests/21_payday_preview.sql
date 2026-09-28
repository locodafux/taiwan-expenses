-- Reviewing an upcoming payday from the dashboard stepper shows that
-- payday's checklist without materializing it for real (20260928000001_payday_preview.sql;
-- in-app feedback 2026-09-28). preview_payday must (a) report nothing to
-- public.ledger_entries and (b) compute the exact same category_id/bill_item_id/amount
-- rows materialize_payday would have written for that date, since both now
-- share private.compute_payday_entries.
--
-- Runs in one transaction and is rolled back, so calling materialize_payday
-- here (only to compare it against the preview) never touches real data.

begin;

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

delete from public.categories where household_id = :'hid';
insert into public.categories (household_id, kind, name, rule) values
  (:'hid', 'bill', 'BILLS', null),
  (:'hid', 'fund', 'SAVINGS', '{"type":"remainder","percent":20,"target_amount":0}'),
  (:'hid', 'fund', 'EMERGENCY FUND', '{"type":"goal","target_amount":200000}');
insert into public.bill_items (category_id, label, amount, recurring_day, end_date)
select c.id, v.label, v.amount, v.day, null from (values
  ('BILLS', 'INTERNET', 1000, 15), ('BILLS', 'WATER', 1500, 15)
) v(cat, label, amount, day) join public.categories c on c.household_id = :'hid' and c.name = v.cat;

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

-- A payday two months out has no ledger_entries yet, and previewing it still
-- writes none.
select pg_temp.expect('no rows before preview',
  (select count(*)::text from public.ledger_entries where household_id = :'hid' and payday_date = '2026-11-15'),
  '0');

select category_id, bill_item_id, amount into temp preview_rows
  from public.preview_payday(:'hid', '2026-11-15');

select pg_temp.expect('preview wrote nothing',
  (select count(*)::text from public.ledger_entries where household_id = :'hid' and payday_date = '2026-11-15'),
  '0');

-- SAVINGS + EMERGENCY FUND (compute_monthly_fund_totals only pools fund
-- categories) plus the two BILLS items due the 15th.
select pg_temp.expect('preview computed rows', (select count(*)::text from preview_rows), '4');

select category_id, bill_item_id, amount into temp materialized_rows
  from public.materialize_payday(:'hid', '2026-11-15');

-- Same category_id/bill_item_id/amount either way - preview and materialize
-- now share the same computation.
select pg_temp.expect('preview matches materialize',
  (select string_agg(category_id || ':' || coalesce(bill_item_id::text, '-') || '=' || amount::int, ',' order by category_id, bill_item_id)
   from preview_rows),
  (select string_agg(category_id || ':' || coalesce(bill_item_id::text, '-') || '=' || amount::int, ',' order by category_id, bill_item_id)
   from materialized_rows));

reset role;
rollback;

select 'PASS: 21_payday_preview' as result;
