-- Excess-group allocation: linked children replace their own normal rule,
-- receive a percentage of the parent's payday amount, and never create money.
-- Everything runs in one transaction and is rolled back.

begin;

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

delete from public.categories where household_id = :'hid';

insert into public.categories (household_id, kind, name, sort_order, rule)
values
  (:'hid', 'fund', 'Partial source', 1, '{"type":"remainder","percent":100,"excess_source":true}'),
  (:'hid', 'fund', 'Full source', 2, '{"type":"goal","target_amount":20000,"excess_source":true}'),
  (:'hid', 'fund', 'Zero source', 3, '{"type":"goal","target_amount":100,"excess_source":true}');

select id as partial_id from public.categories where household_id = :'hid' and name = 'Partial source' \gset
select id as full_id from public.categories where household_id = :'hid' and name = 'Full source' \gset
select id as zero_id from public.categories where household_id = :'hid' and name = 'Zero source' \gset

insert into public.categories (household_id, kind, name, sort_order, rule)
values
  (:'hid', 'fund', 'Partial child A', 10, jsonb_build_object('type', 'excess', 'parent_id', (select id from public.categories where name = 'Partial source'), 'percent', 25)),
  (:'hid', 'fund', 'Partial child B', 11, jsonb_build_object('type', 'excess', 'parent_id', (select id from public.categories where name = 'Partial source'), 'percent', 25)),
  (:'hid', 'fund', 'Full child A', 12, jsonb_build_object('type', 'excess', 'parent_id', (select id from public.categories where name = 'Full source'), 'percent', 60)),
  (:'hid', 'fund', 'Full child B', 13, jsonb_build_object('type', 'excess', 'parent_id', (select id from public.categories where name = 'Full source'), 'percent', 40)),
  (:'hid', 'fund', 'Zero child', 14, jsonb_build_object('type', 'excess', 'parent_id', (select id from public.categories where name = 'Zero source'), 'percent', 100));

select id as partial_a_id from public.categories where name = 'Partial child A' \gset
select id as partial_b_id from public.categories where name = 'Partial child B' \gset
select id as full_a_id from public.categories where name = 'Full child A' \gset
select id as full_b_id from public.categories where name = 'Full child B' \gset
select id as zero_child_id from public.categories where name = 'Zero child' \gset

-- Already checked savings make Zero source's remaining goal zero. Its child
-- must be a no-op rather than an unnecessary ₱0 ledger row.
insert into public.ledger_entries (category_id, payday_date, amount, status, checked_at)
values (:'zero_id', '2026-11-20', 100, 'checked', now());

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

select count(*) from public.materialize_payday(:'hid', '2026-12-05');

-- The partial group claims half of its ₱13,104 payday allocation. Rounding is
-- absorbed by the last weighted child, while the parent keeps the rest.
select pg_temp.expect('partial group conservation',
  (select sum(le.amount)::int::text
   from public.ledger_entries le
   where le.payday_date = '2026-12-05'
     and le.category_id in (:'partial_id'::uuid, :'partial_a_id'::uuid, :'partial_b_id'::uuid)),
  (select (private.allocate_proportional(t.monthly_total, array[20000::numeric, 9000, 20000, 9000]))[1]::int::text
   from private.compute_monthly_fund_totals(:'hid', '2026-12-01') t
   where t.category_id = :'partial_id'::uuid));

select pg_temp.expect('partial group parent remainder',
  (select amount::int::text from public.ledger_entries
   where category_id = :'partial_id'::uuid and payday_date = '2026-12-05'), '6552');
select pg_temp.expect('partial group child total',
  (select sum(amount)::int::text from public.ledger_entries
   where payday_date = '2026-12-05'
     and category_id in (:'partial_a_id'::uuid, :'partial_b_id'::uuid)), '6552');

-- The full group claims all of its ₱6,897 payday allocation, leaving zero in
-- the source while preserving the exact same total.
select pg_temp.expect('full group conservation',
  (select sum(le.amount)::int::text
   from public.ledger_entries le
   where le.payday_date = '2026-12-05'
     and le.category_id in (:'full_id'::uuid, :'full_a_id'::uuid, :'full_b_id'::uuid)),
  (select (private.allocate_proportional(t.monthly_total, array[20000::numeric, 9000, 20000, 9000]))[1]::int::text
   from private.compute_monthly_fund_totals(:'hid', '2026-12-01') t
   where t.category_id = :'full_id'::uuid));

select pg_temp.expect('full group parent remainder',
  (select amount::int::text from public.ledger_entries
   where category_id = :'full_id'::uuid and payday_date = '2026-12-05'), '0');

select pg_temp.expect('zero group no-op',
  (select count(*)::text from public.ledger_entries
   where category_id = :'zero_child_id'::uuid and payday_date = '2026-12-05'), '0');

reset role;

-- A third child would make Partial source's percentages 101%; the rule-level
-- trigger rejects it instead of silently capping the typo.
do $$
declare
  v_hid uuid;
  v_partial_id uuid;
begin
  select c.household_id, c.id into v_hid, v_partial_id
  from public.categories c
  where c.name = 'Partial source';
  begin
    insert into public.categories (household_id, kind, name, rule)
    values (v_hid, 'fund', 'Overfull child',
      jsonb_build_object('type', 'excess', 'parent_id', v_partial_id, 'percent', 51));
    raise exception 'FAIL: overfull excess group was accepted';
  exception when others then
    if position('cannot exceed 100' in sqlerrm) = 0 then
      raise exception 'FAIL: unexpected overfull-group error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;

select 'PASS: 19_excess_groups' as result;
