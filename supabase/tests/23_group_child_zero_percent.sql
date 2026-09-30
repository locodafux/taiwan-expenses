-- A group child may have 0%: it gets nothing, the group's sum rule still holds,
-- and its would-be share stays in the parent (nothing is created or lost).
-- Everything runs in one transaction and is rolled back.

begin;

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

delete from public.categories where household_id = :'hid';

insert into public.categories (household_id, kind, name, sort_order, rule, is_group_parent)
values (:'hid', 'fund', 'Zero parent', 1, '{"type":"remainder","percent":100}', true);
select id as parent_id from public.categories where household_id = :'hid' and name = 'Zero parent' \gset

insert into public.categories (household_id, kind, name, sort_order, rule)
values
  (:'hid', 'fund', 'Zero child', 10, jsonb_build_object('type', 'group_child', 'parent_id', :'parent_id'::uuid, 'percent', 0)),
  (:'hid', 'fund', 'Forty child', 11, jsonb_build_object('type', 'group_child', 'parent_id', :'parent_id'::uuid, 'percent', 40));
select id as zero_id from public.categories where household_id = :'hid' and name = 'Zero child' \gset
select id as forty_id from public.categories where household_id = :'hid' and name = 'Forty child' \gset

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

select pg_temp.expect('zero child gets nothing',
  (select coalesce(sum(amount), 0)::int::text from public.ledger_entries
   where category_id = :'zero_id'::uuid and payday_date = '2026-12-05'), '0');
select pg_temp.expect('forty child gets 40% of the parent payday',
  (select (le.amount * 100 / (le.amount + p.amount))::int::text
   from public.ledger_entries le
   join public.ledger_entries p on p.payday_date = le.payday_date and p.category_id = :'parent_id'::uuid
   where le.category_id = :'forty_id'::uuid and le.payday_date = '2026-12-05'), '40');

-- A group made only of 0% children leaves the whole payday in the parent.
update public.categories
set rule = jsonb_build_object('type', 'group_child', 'parent_id', :'parent_id'::uuid, 'percent', 0)
where id = :'forty_id'::uuid;
select count(*) from public.materialize_payday(:'hid', '2026-12-05');
select pg_temp.expect('all-zero group: children get nothing',
  (select coalesce(sum(amount), 0)::int::text from public.ledger_entries
   where category_id in (:'zero_id'::uuid, :'forty_id'::uuid) and payday_date = '2026-12-05'), '0');
select pg_temp.expect('all-zero group: parent keeps its whole payday',
  (select (amount > 0)::text from public.ledger_entries
   where category_id = :'parent_id'::uuid and payday_date = '2026-12-05'), 'true');

-- Out-of-range percentages are still rejected.
do $$
declare v_pct int;
begin
  foreach v_pct in array array[-1, 101] loop
    begin
      update public.categories
      set rule = jsonb_set(rule, '{percent}', to_jsonb(v_pct))
      where name = 'Zero child';
      raise exception 'FAIL: % percent was accepted', v_pct;
    exception when others then
      if position('between 0 and 100' in sqlerrm) = 0 and position('cannot exceed 100' in sqlerrm) = 0 then
        raise exception 'FAIL: unexpected error for %: %', v_pct, sqlerrm;
      end if;
    end;
  end loop;
end;
$$;

rollback;

select 'PASS: 23_group_child_zero_percent' as result;
