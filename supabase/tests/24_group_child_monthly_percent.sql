-- Per-month percentages for group children: an override replaces the child's
-- default percentage for that month only, the group's <= 100% rule holds for
-- every month, and months without overrides behave exactly as before.
-- Everything runs in one transaction and is rolled back.

begin;

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

delete from public.categories where household_id = :'hid';

insert into public.categories (household_id, kind, name, sort_order, rule, is_group_parent)
values (:'hid', 'fund', 'Month parent', 1, '{"type":"remainder","percent":100}', true);
select id as parent_id from public.categories where household_id = :'hid' and name = 'Month parent' \gset

insert into public.categories (household_id, kind, name, sort_order, rule)
select :'hid', 'fund', n, s, jsonb_build_object('type', 'group_child', 'parent_id', :'parent_id'::uuid, 'percent', 20)
from (values ('Child A', 10), ('Child B', 11), ('Child C', 12)) v(n, s);
select id as a_id from public.categories where household_id = :'hid' and name = 'Child A' \gset
select id as b_id from public.categories where household_id = :'hid' and name = 'Child B' \gset
select id as c_id from public.categories where household_id = :'hid' and name = 'Child C' \gset

create function pg_temp.expect(p_label text, p_got text, p_want text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL: % was %, expected %', p_label, p_got, p_want;
  end if;
end;
$$;

-- share of the whole group's payday (parent + children) that one category got,
-- not counting what fund rollover carried in from the previous payday
create function pg_temp.share(p_cat uuid, p_parent uuid, p_payday date)
returns numeric language sql as $$
  select round(100.0 * (select coalesce(sum(amount - carried_amount), 0) from public.ledger_entries
                        where category_id = p_cat and payday_date = p_payday)
         / nullif((select sum(le.amount - le.carried_amount) from public.ledger_entries le
                   join public.categories c on c.id = le.category_id
                   where le.payday_date = p_payday
                     and (c.id = p_parent or c.rule ->> 'parent_id' = p_parent::text)), 0));
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'leo_id', true);

-- December: A takes 0%, B takes 70%; C keeps its 20% default.
insert into public.category_month_percents (category_id, month, percent)
values (:'a_id', '2026-12-01', 0), (:'b_id', '2026-12-01', 70);

select pg_temp.expect('household filled from category',
  (select count(*)::text from public.category_month_percents where household_id = :'hid'), '2');

select count(*) from public.materialize_payday(:'hid', '2026-12-05');
select pg_temp.expect('Dec: A override 0%', pg_temp.share(:'a_id', :'parent_id', '2026-12-05')::text, '0');
select pg_temp.expect('Dec: B override 70%', pg_temp.share(:'b_id', :'parent_id', '2026-12-05')::text, '70');
select pg_temp.expect('Dec: C default 20%', pg_temp.share(:'c_id', :'parent_id', '2026-12-05')::text, '20');
select pg_temp.expect('Dec: parent keeps the rest', pg_temp.share(:'parent_id', :'parent_id', '2026-12-05')::text, '10');

-- January has no override: everyone uses the default, exactly as before.
select count(*) from public.materialize_payday(:'hid', '2027-01-05');
select pg_temp.expect('Jan: A default 20%', pg_temp.share(:'a_id', :'parent_id', '2027-01-05')::text, '20');
select pg_temp.expect('Jan: B default 20%', pg_temp.share(:'b_id', :'parent_id', '2027-01-05')::text, '20');
select pg_temp.expect('Jan: parent keeps 40%', pg_temp.share(:'parent_id', :'parent_id', '2027-01-05')::text, '40');

-- The preview (read-only) applies the same overrides.
select pg_temp.expect('preview uses the override',
  (select round(100.0 * sum(p.amount - p.carried_amount) filter (where p.category_id = :'b_id'::uuid) / sum(p.amount - p.carried_amount))::text
   from public.preview_payday(:'hid', '2026-12-05') p
   where p.category_id in (:'parent_id'::uuid, :'a_id'::uuid, :'b_id'::uuid, :'c_id'::uuid)), '70');

-- Rejections: the month's total may not pass 100, defaults included.
do $$
declare v_rejected boolean;
begin
  begin
    insert into public.category_month_percents (category_id, month, percent)
    values ((select id from public.categories where name = 'Child C'), '2026-12-01', 40);
    raise exception 'FAIL: December total of 110 was accepted';
  exception when others then
    if position('cannot exceed 100' in sqlerrm) = 0 then raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;
  -- raising C's default would push December (0 + 70 + 40) over 100 even
  -- though the defaults alone (20 + 20 + 40) fit.
  begin
    update public.categories set rule = jsonb_set(rule, '{percent}', '40') where name = 'Child C';
    raise exception 'FAIL: default change breaking December was accepted';
  exception when others then
    if position('cannot exceed 100' in sqlerrm) = 0 then raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;
  -- removing A's 0% override would put A back to 20% in December (20 + 70 + 20).
  begin
    delete from public.category_month_percents where category_id = (select id from public.categories where name = 'Child A');
    raise exception 'FAIL: deleting an override that breaks the month was accepted';
  exception when others then
    if position('would exceed 100' in sqlerrm) = 0 then raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;
  v_rejected := false;
  begin
    insert into public.category_month_percents (category_id, month, percent)
    values ((select id from public.categories where name = 'Child C'), '2027-02-01', 101);
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: 101 percent was accepted'; end if;
  v_rejected := false;
  begin
    insert into public.category_month_percents (category_id, month, percent)
    values ((select id from public.categories where name = 'Child C'), '2027-02-15', 10);
  exception when others then v_rejected := true;
  end;
  if not v_rejected then raise exception 'FAIL: mid-month date was accepted'; end if;
  begin
    insert into public.category_month_percents (category_id, month, percent)
    values ((select id from public.categories where name = 'Month parent'), '2027-02-01', 10);
    raise exception 'FAIL: override on a non-child was accepted';
  exception when others then
    if position('inside a group' in sqlerrm) = 0 then raise exception 'FAIL: unexpected error: %', sqlerrm; end if;
  end;
end;
$$;

-- Leaving the group drops the child's overrides.
update public.categories
set rule = '{"type":"remainder","percent":10}'
where id = :'b_id'::uuid;
select pg_temp.expect('unlinking drops overrides',
  (select count(*)::text from public.category_month_percents where category_id = :'b_id'::uuid), '0');

rollback;

select 'PASS: 24_group_child_monthly_percent' as result;
