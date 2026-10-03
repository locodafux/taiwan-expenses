-- Group child percentage checks only count children that are in range in the
-- month being checked (20261001000001_group_child_ranges.sql). Pinatubo runs
-- Oct-Nov, Taiwan Fund Dec-Feb, both inside one group. Rolled back at the end.

begin;

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

delete from public.categories where household_id = :'hid';

insert into public.categories (household_id, kind, name, sort_order, rule, is_group_parent)
values (:'hid', 'fund', 'Range parent', 1, '{"type":"remainder","percent":100}', true);
select id as parent_id from public.categories where household_id = :'hid' and name = 'Range parent' \gset

-- Both defaults are 100: they never overlap, so the group allows it.
insert into public.categories (household_id, kind, name, sort_order, rule, start_month, end_month)
values
  (:'hid', 'fund', 'Pinatubo', 10, jsonb_build_object('type', 'group_child', 'parent_id', :'parent_id'::uuid, 'percent', 100), '2026-10-01', '2026-11-01'),
  (:'hid', 'fund', 'Taiwan Fund', 11, jsonb_build_object('type', 'group_child', 'parent_id', :'parent_id'::uuid, 'percent', 100), '2026-12-01', '2027-02-01');
select id as pin_id from public.categories where household_id = :'hid' and name = 'Pinatubo' \gset
select id as tw_id from public.categories where household_id = :'hid' and name = 'Taiwan Fund' \gset

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

-- Each fund can take 100 in its own months even though the other's default is 100.
insert into public.category_month_percents (category_id, month, percent)
values (:'pin_id', '2026-10-01', 100), (:'tw_id', '2026-12-01', 100), (:'tw_id', '2027-01-01', 100);
select pg_temp.expect('overrides saved', (select count(*)::text from public.category_month_percents where household_id = :'hid'), '3');

-- An override for a month the fund is not part of is never refused.
insert into public.category_month_percents (category_id, month, percent)
values (:'pin_id', '2027-03-01', 100);

-- Dropping an override only re-checks siblings that are in range.
delete from public.category_month_percents where category_id = :'pin_id'::uuid and month = '2026-10-01';

do $$
begin
  -- A default that overlaps a sibling's months is still refused.
  begin
    update public.categories set start_month = '2026-11-01' where name = 'Taiwan Fund';
    raise exception 'FAIL: overlapping range with two 100 percent defaults was accepted';
  exception when others then
    if position('cannot exceed 100' in sqlerrm) = 0 then raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;
  -- Months that do overlap still add up: Pinatubo now runs through Dec, 70 + 30.
  delete from public.category_month_percents;
  update public.categories set rule = jsonb_set(rule, '{percent}', '30') where name = 'Taiwan Fund';
  update public.categories set end_month = '2026-12-01', rule = jsonb_set(rule, '{percent}', '70') where name = 'Pinatubo';
  begin
    update public.categories set rule = jsonb_set(rule, '{percent}', '40') where name = 'Taiwan Fund';
    raise exception 'FAIL: Dec total of 110 was accepted';
  exception when others then
    if position('cannot exceed 100' in sqlerrm) = 0 then raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;
  begin
    insert into public.category_month_percents (category_id, month, percent)
    values ((select id from public.categories where name = 'Pinatubo'), '2026-12-01', 80);
    raise exception 'FAIL: Dec override total of 180 was accepted';
  exception when others then
    if position('cannot exceed 100 in Dec 2026' in sqlerrm) = 0 then raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;
end;
$$;

rollback;

select 'PASS: 25_group_child_ranges' as result;
