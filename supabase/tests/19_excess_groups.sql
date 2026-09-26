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

-- Generic group children can carry a nested goal. The percentage is a cap
-- toward that goal, so the child takes only its remaining room and the parent
-- keeps the unused share.
insert into public.categories (household_id, kind, name, sort_order, rule, is_group_parent)
values
  (:'hid', 'fund', 'Generic source', 20, '{"type":"goal","target_amount":10000}', true),
  (:'hid', 'bill', 'Structural parent', 21, null, true);

select id as generic_id from public.categories where household_id = :'hid' and name = 'Generic source' \gset
select id as structural_id from public.categories where household_id = :'hid' and name = 'Structural parent' \gset

insert into public.categories (household_id, kind, name, sort_order, rule)
values
  (:'hid', 'fund', 'Capped child', 22,
    jsonb_build_object(
      'type', 'group_child',
      'parent_id', :'generic_id'::uuid,
      'percent', 60,
      'goal', jsonb_build_object('target_amount', 1000, 'target_date', '2027-02-01', 'one_time', false)
    )),
  (:'hid', 'fund', 'Structural child', 23,
    jsonb_build_object('type', 'group_child', 'parent_id', :'structural_id'::uuid, 'percent', 100));

select id as capped_child_id from public.categories where household_id = :'hid' and name = 'Capped child' \gset
select id as structural_child_id from public.categories where household_id = :'hid' and name = 'Structural child' \gset

select pg_temp.expect('generic child has nested goal',
  (select (rule -> 'goal' ->> 'target_amount') from public.categories where id = :'capped_child_id'::uuid), '1000');
select pg_temp.expect('structural parent has no monetary rows',
  (select count(*)::text from public.ledger_entries
   where category_id = :'structural_child_id'::uuid and payday_date = '2026-12-05'), '0');

select count(*) from public.materialize_payday(:'hid', '2026-12-05');
select pg_temp.expect('capped child payout',
  (select amount::int::text from public.ledger_entries
   where category_id = :'capped_child_id'::uuid and payday_date = '2026-12-05'), '1000');
select pg_temp.expect('capped parent keeps unused share',
  (select (p.amount + c.amount)::int::text
   from public.ledger_entries p
   join public.ledger_entries c on c.payday_date = p.payday_date
     and c.category_id = :'capped_child_id'::uuid
   where p.category_id = :'generic_id'::uuid and p.payday_date = '2026-12-05'),
  (select (private.allocate_proportional(t.monthly_total, array[20000::numeric, 9000, 20000, 9000]))[1]::int::text
   from private.compute_monthly_fund_totals(:'hid', '2026-12-01') t
   where t.category_id = :'generic_id'::uuid));

-- Once the capped child is checked, the next payday gets no stale overpayment;
-- the parent receives the full source amount and the child row is zero.
update public.ledger_entries
set status = 'checked', checked_at = now()
where category_id = :'capped_child_id'::uuid and payday_date = '2026-12-05';
select count(*) from public.materialize_payday(:'hid', '2027-01-05');
select pg_temp.expect('met child has no next payout',
  (select amount::int::text from public.ledger_entries
   where category_id = :'capped_child_id'::uuid and payday_date = '2027-01-05'), '0');

-- Legacy excess children remain valid after the generic migration.
select pg_temp.expect('legacy child still present',
  (select count(*)::text from public.categories
   where rule ->> 'type' = 'excess' and rule ->> 'parent_id' = :'partial_id'), '2');

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

-- Generic validation rejects malformed nested goals, self-links, second-level
-- parents, and deleting a parent with children.
do $$
declare
  v_hid uuid;
  v_generic_id uuid;
  v_capped_id uuid;
  v_self_id uuid := extensions.gen_random_uuid();
begin
  select household_id, id into v_hid, v_generic_id
  from public.categories where name = 'Generic source';
  select id into v_capped_id from public.categories where name = 'Capped child';

  begin
    insert into public.categories (household_id, kind, name, rule)
    values (v_hid, 'fund', 'Bad target', jsonb_build_object(
      'type', 'group_child', 'parent_id', v_generic_id, 'percent', 10,
      'goal', jsonb_build_object('target_amount', 0)));
    raise exception 'FAIL: non-positive nested target was accepted';
  exception when others then
    if position('target_amount must be a positive number' in sqlerrm) = 0 then
      raise exception 'FAIL: unexpected nested-target error: %', sqlerrm;
    end if;
  end;

  begin
    insert into public.categories (household_id, kind, name, rule)
    values (v_hid, 'fund', 'Bad date', jsonb_build_object(
      'type', 'group_child', 'parent_id', v_generic_id, 'percent', 10,
      'goal', jsonb_build_object('target_amount', 100, 'target_date', 'not-a-date')));
    raise exception 'FAIL: invalid nested date was accepted';
  exception when others then
    if position('target_date must be a valid date' in sqlerrm) = 0 then
      raise exception 'FAIL: unexpected nested-date error: %', sqlerrm;
    end if;
  end;

  begin
    insert into public.categories (id, household_id, kind, name, rule)
    values (v_self_id, v_hid, 'fund', 'Self child', '{"type":"remainder","percent":10}');
    update public.categories
    set rule = jsonb_build_object('type', 'group_child', 'parent_id', v_self_id, 'percent', 10)
    where id = v_self_id;
    raise exception 'FAIL: self-linked child was accepted';
  exception when others then
    if position('cannot link to itself' in sqlerrm) = 0 then
      raise exception 'FAIL: unexpected self-link error: %', sqlerrm;
    end if;
  end;

  begin
    insert into public.categories (household_id, kind, name, rule)
    values (v_hid, 'fund', 'Second level', jsonb_build_object(
      'type', 'group_child', 'parent_id', v_capped_id, 'percent', 10));
    raise exception 'FAIL: second-level child was accepted';
  exception when others then
    if position('group parent' in sqlerrm) = 0 and position('multi-level' in sqlerrm) = 0 then
      raise exception 'FAIL: unexpected second-level error: %', sqlerrm;
    end if;
  end;

  begin
    delete from public.categories where id = v_generic_id;
    raise exception 'FAIL: parent with children was deleted';
  exception when others then
    if position('while it has linked categories' in sqlerrm) = 0 then
      raise exception 'FAIL: unexpected parent-delete error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;

select 'PASS: 19_excess_groups' as result;
