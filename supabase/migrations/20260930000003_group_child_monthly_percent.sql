-- Per-month percentage for a group child. The category's own rule.percent
-- stays the default; a row here overrides it for one month (always the first of
-- the month), and 0 is allowed (that child takes nothing that month). Additive:
-- a new table, so with no rows nothing changes for existing data.
--
-- Effective percent of a child in month m = override for m if present, else the
-- default. Everything that reads a child's share now uses that: the payday
-- allocation (private.excess_group_allocations, which also feeds
-- materialize_payday and preview_payday), the goal shortfall projection, and
-- the group's <= 100% sum rule (checked per month, for the default and for
-- every month that has an override). The remainder behaviour is unchanged: any
-- unclaimed share stays in the parent.
create table public.category_month_percents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  percent numeric not null check (percent >= 0 and percent <= 100),
  created_at timestamptz not null default now(),
  unique (category_id, month)
);

create index category_month_percents_household_idx
  on public.category_month_percents (household_id, month);

create trigger category_month_percents_set_household_id
  before insert or update of category_id on public.category_month_percents
  for each row execute function public.set_household_id_from_category();

alter table public.category_month_percents enable row level security;

create policy "members read category_month_percents" on public.category_month_percents
  for select to authenticated using (household_id in (select private.user_household_ids()));
create policy "members write category_month_percents" on public.category_month_percents
  for insert to authenticated with check (household_id in (select private.user_household_ids()));
create policy "members update category_month_percents" on public.category_month_percents
  for update to authenticated
  using (household_id in (select private.user_household_ids()))
  with check (household_id in (select private.user_household_ids()));
create policy "members delete category_month_percents" on public.category_month_percents
  for delete to authenticated using (household_id in (select private.user_household_ids()));

alter publication supabase_realtime add table public.category_month_percents;

-- Sum of the effective percentages of a group's children in a month, leaving
-- one child out (the row a trigger is about to write). A null month means "the
-- defaults" (no override joins).
create function private.group_month_total(p_parent_id uuid, p_month date, p_exclude uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(coalesce(o.percent, (c.rule ->> 'percent')::numeric)), 0)
  from public.categories c
  left join public.category_month_percents o on o.category_id = c.id and o.month = p_month
  where c.rule ->> 'type' in ('excess', 'group_child')
    and c.rule ->> 'parent_id' = p_parent_id::text
    and c.id <> p_exclude;
$$;

create function private.validate_month_percent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cat public.categories;
  v_total numeric;
begin
  if tg_op = 'DELETE' then
    -- Nested (a category unlinked/deleted, or a household cascade): nothing to
    -- re-check, the parent trigger owns that path.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    select * into v_cat from public.categories where id = old.category_id;
    if not found or v_cat.rule ->> 'type' not in ('excess', 'group_child') then
      return old;
    end if;
    -- Dropping an override puts the default back, which must still fit.
    v_total := private.group_month_total((v_cat.rule ->> 'parent_id')::uuid, old.month, v_cat.id)
      + (v_cat.rule ->> 'percent')::numeric;
    if v_total > 100 then
      raise exception 'group child percentages would exceed 100 in % (got %)',
        to_char(old.month, 'Mon YYYY'), v_total;
    end if;
    return old;
  end if;

  select * into v_cat from public.categories where id = new.category_id;
  if not found or v_cat.rule ->> 'type' not in ('excess', 'group_child') then
    raise exception 'a monthly percentage only applies to a category inside a group';
  end if;
  v_total := private.group_month_total((v_cat.rule ->> 'parent_id')::uuid, new.month, v_cat.id) + new.percent;
  if v_total > 100 then
    raise exception 'group child percentages cannot exceed 100 in % (got %)',
      to_char(new.month, 'Mon YYYY'), v_total;
  end if;
  return new;
end;
$$;

create trigger category_month_percents_validate
  before insert or update of category_id, month, percent or delete on public.category_month_percents
  for each row execute function private.validate_month_percent();

-- The categories trigger below also checks every override month (and drops a
-- child's overrides when it leaves its group). Otherwise identical to
-- 20260930000002.
create or replace function private.validate_excess_group_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.categories;
  v_percent numeric;
  v_child_total numeric;
  v_parent_id uuid;
  v_goal jsonb;
  v_target numeric;
  v_target_date date;
  v_is_child boolean;
  v_month date;
  v_month_total numeric;
  v_old_parent text;
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.categories c
      where c.rule ->> 'type' in ('excess', 'group_child')
        and c.rule ->> 'parent_id' = old.id::text
    ) then
      raise exception 'cannot delete group parent % while it has linked categories', old.name;
    end if;
    return old;
  end if;

  v_is_child := new.rule ->> 'type' in ('excess', 'group_child');
  if tg_op = 'UPDATE' and old.rule ->> 'type' in ('excess', 'group_child') then
    v_old_parent := old.rule ->> 'parent_id';
  end if;

  -- A group child is an allocation rule, so it remains fund-only. The parent
  -- relationship itself is structural and may point at a bill category.
  if v_is_child then
    if new.kind <> 'fund' then
      raise exception 'only fund categories can link to a group parent';
    end if;
    if new.is_group_parent then
      raise exception 'a group child cannot also be a group parent';
    end if;
    if new.rule ->> 'parent_id' is null then
      raise exception 'a group child needs a parent_id';
    end if;

    begin
      v_parent_id := (new.rule ->> 'parent_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'group parent_id must be a valid category id';
    end;

    select c.* into v_parent
    from public.categories c
    where c.id = v_parent_id;
    if not found then
      raise exception 'group parent % does not exist', new.rule ->> 'parent_id';
    end if;
    if v_parent.household_id <> new.household_id then
      raise exception 'group parent must belong to the same household';
    end if;
    if v_parent.id = new.id then
      raise exception 'a group child cannot link to itself';
    end if;
    if not v_parent.is_group_parent and v_parent.rule ->> 'excess_source' <> 'true' then
      raise exception 'group parent must be marked as a group parent';
    end if;
    if v_parent.rule ->> 'type' in ('excess', 'group_child') then
      raise exception 'multi-level category groups are not supported';
    end if;

    begin
      v_percent := (new.rule ->> 'percent')::numeric;
    exception when invalid_text_representation then
      raise exception 'group percentage must be a number between 0 and 100';
    end;
    if v_percent is null or v_percent <> v_percent or v_percent < 0 or v_percent > 100 then
      raise exception 'group percentage must be between 0 and 100';
    end if;

    v_goal := new.rule -> 'goal';
    if v_goal is not null then
      if jsonb_typeof(v_goal) <> 'object' then
        raise exception 'group child goal must be an object';
      end if;
      if v_goal ->> 'target_amount' is null then
        raise exception 'group child goal needs a target_amount';
      end if;
      begin
        v_target := (v_goal ->> 'target_amount')::numeric;
      exception when invalid_text_representation then
        raise exception 'group child goal target_amount must be a positive number';
      end;
      if v_target is null or v_target <> v_target or v_target <= 0 then
        raise exception 'group child goal target_amount must be a positive number';
      end if;
      if v_goal ? 'target_date' and v_goal ->> 'target_date' is not null then
        begin
          v_target_date := (v_goal ->> 'target_date')::date;
        exception when others then
          raise exception 'group child goal target_date must be a valid date';
        end;
        if v_target_date is null then
          raise exception 'group child goal target_date must be a valid date';
        end if;
      end if;
      if v_goal ? 'one_time' and jsonb_typeof(v_goal -> 'one_time') <> 'boolean' then
        raise exception 'group child goal one_time must be a boolean';
      end if;
    end if;
  else
    v_parent_id := new.id;
  end if;

  select coalesce(sum((c.rule ->> 'percent')::numeric), 0)
    into v_child_total
  from public.categories c
  where c.household_id = new.household_id
    and c.rule ->> 'type' in ('excess', 'group_child')
    and c.rule ->> 'parent_id' = v_parent_id::text;

  -- A BEFORE trigger cannot see the row currently being inserted/updated.
  if v_is_child then
    if tg_op = 'UPDATE'
      and old.rule ->> 'type' in ('excess', 'group_child')
      and old.rule ->> 'parent_id' = v_parent_id::text then
      v_child_total := v_child_total - (old.rule ->> 'percent')::numeric;
    end if;
    v_child_total := v_child_total + v_percent;
  end if;

  if not new.is_group_parent and new.rule ->> 'excess_source' <> 'true' and v_child_total > 0 then
    raise exception 'cannot remove group parent while it has linked categories';
  end if;
  if v_child_total > 100 then
    raise exception 'group child percentages cannot exceed 100 (got %)', v_child_total;
  end if;

  if v_is_child then
    -- A child that stops being one (or moves parent) drops its month overrides.
    -- Nested, so the override table's own delete check is skipped.
    if v_old_parent is not null and v_old_parent <> v_parent_id::text then
      delete from public.category_month_percents where category_id = new.id;
    end if;
    -- The same <= 100 rule for every month that has an override in this group.
    for v_month in
      select o.month
      from public.category_month_percents o
      join public.categories c on c.id = o.category_id
      where c.rule ->> 'parent_id' = v_parent_id::text and c.id <> new.id
      union
      select o.month from public.category_month_percents o
      where o.category_id = new.id and v_old_parent is not distinct from v_parent_id::text
    loop
      v_month_total := private.group_month_total(v_parent_id, v_month, new.id)
        + coalesce((select o.percent from public.category_month_percents o
                    where o.category_id = new.id and o.month = v_month), v_percent);
      if v_month_total > 100 then
        raise exception 'group child percentages cannot exceed 100 in % (got %)',
          to_char(v_month, 'Mon YYYY'), v_month_total;
      end if;
    end loop;
  elsif v_old_parent is not null then
    delete from public.category_month_percents where category_id = new.id;
  end if;

  return new;
end;
$$;

-- Effective (override-or-default) percentage for the payday's month. Otherwise
-- identical to 20260930000001.
create or replace function private.excess_group_allocations(
  p_parent_id uuid,
  p_amount numeric,
  p_payday_date date default null
)
returns table (category_id uuid, amount numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_rules jsonb[];
  v_percentages numeric[];
  v_total numeric;
  v_amounts numeric[];
  v_goal_room numeric;
  v_checked_current numeric;
  i int;
begin
  select
    coalesce(array_agg(c.id order by c.sort_order, c.id), ARRAY[]::uuid[]),
    coalesce(array_agg(c.rule order by c.sort_order, c.id), ARRAY[]::jsonb[]),
    coalesce(array_agg(coalesce(o.percent, (c.rule ->> 'percent')::numeric) order by c.sort_order, c.id), ARRAY[]::numeric[]),
    coalesce(sum(coalesce(o.percent, (c.rule ->> 'percent')::numeric)), 0)
  into v_ids, v_rules, v_percentages, v_total
  from public.categories c
  left join public.category_month_percents o
    on o.category_id = c.id and o.month = date_trunc('month', p_payday_date)::date
  where c.household_id = (select household_id from public.categories where id = p_parent_id)
    and c.kind = 'fund'
    and c.rule ->> 'type' in ('excess', 'group_child')
    and c.rule ->> 'parent_id' = p_parent_id::text
    and (p_payday_date is null or private.category_in_range(c.start_month, c.end_month, p_payday_date));

  if cardinality(v_ids) = 0 then
    return;
  end if;

  if p_amount <= 0 then
    return;
  end if;

  v_amounts := private.allocate_proportional(p_amount * v_total / 100, v_percentages);
  for i in 1 .. cardinality(v_ids) loop
    amount := v_amounts[i];

    if p_payday_date is not null then
      select coalesce(sum(le.amount), 0)
        into v_checked_current
      from public.ledger_entries le
      where le.category_id = v_ids[i]
        and le.payday_date = p_payday_date
        and le.bill_item_id is null
        and not le.manual
        and le.status = 'checked';
      if v_checked_current > 0 then
        amount := v_checked_current;
      elsif (v_rules[i] -> 'goal') is not null then
        select greatest(
          0,
          (v_rules[i] -> 'goal' ->> 'target_amount')::numeric - coalesce(sum(le.amount), 0)
        )
          into v_goal_room
        from public.ledger_entries le
        where le.category_id = v_ids[i]
          and le.status = 'checked'
          and le.bill_item_id is null
          and le.payday_date <> p_payday_date;
        amount := least(amount, v_goal_room);
      end if;
    elsif (v_rules[i] -> 'goal') is not null then
      select greatest(
        0,
        (v_rules[i] -> 'goal' ->> 'target_amount')::numeric - coalesce(sum(le.amount), 0)
      )
        into v_goal_room
      from public.ledger_entries le
      where le.category_id = v_ids[i]
        and le.status = 'checked'
        and le.bill_item_id is null;
      amount := least(amount, v_goal_room);
    end if;

    category_id := v_ids[i];
    return next;
  end loop;
end;
$$;

-- Expected monthly share uses that month's effective percentage. Otherwise
-- identical to 20260926000002.
create or replace function private.group_child_goal_shortfalls(p_household_id uuid, p_month date)
returns table (category_id uuid, shortfall numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', p_month)::date;
  v_periods int;
  v_remaining numeric;
  v_expected numeric;
  v_parent_monthly numeric;
  rec record;
  m int;
begin
  for rec in
    select c.id, c.rule,
      greatest(0, (c.rule -> 'goal' ->> 'target_amount')::numeric - coalesce((
        select sum(le.amount)
        from public.ledger_entries le
        where le.category_id = c.id and le.status = 'checked'
      ), 0)) as remaining
    from public.categories c
    where c.household_id = p_household_id
      and c.kind = 'fund'
      and not c.archived
      and c.rule ->> 'type' in ('excess', 'group_child')
      and c.rule -> 'goal' is not null
      and (c.rule -> 'goal' ->> 'target_date') is not null
  loop
    v_periods := greatest(1, (
      extract(year from age(date_trunc('month', (rec.rule -> 'goal' ->> 'target_date')::date), v_month_start)) * 12
      + extract(month from age(date_trunc('month', (rec.rule -> 'goal' ->> 'target_date')::date), v_month_start))
    )::int);
    v_remaining := rec.remaining;

    for m in 1..v_periods loop
      exit when v_remaining <= 0;
      v_parent_monthly := 0;
      select coalesce(ct.monthly_total, 0) into v_parent_monthly
      from private.compute_monthly_fund_totals(
        p_household_id,
        (v_month_start + make_interval(months => m - 1))::date
      ) ct
      where ct.category_id = (rec.rule ->> 'parent_id')::uuid;
      v_expected := round(greatest(0, v_parent_monthly) * coalesce((
        select o.percent from public.category_month_percents o
        where o.category_id = rec.id and o.month = (v_month_start + make_interval(months => m - 1))::date
      ), (rec.rule ->> 'percent')::numeric) / 100);
      v_remaining := greatest(0, v_remaining - least(v_remaining, v_expected));
    end loop;

    category_id := rec.id;
    shortfall := v_remaining;
    return next;
  end loop;
end;
$$;
