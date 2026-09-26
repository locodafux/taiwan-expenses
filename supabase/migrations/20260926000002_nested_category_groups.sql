-- General category groups: any category can be a structural parent, while
-- fund children use a generic group_child rule with an optional nested goal.
-- Legacy {type: 'excess'} rows remain valid and are read identically to a
-- group_child without a goal.

alter table public.categories
  add column if not exists is_group_parent boolean not null default false;

-- The old excess_source flag was the fund-only parent marker. Backfill the
-- dedicated structural marker before the old trigger is replaced.
update public.categories
set is_group_parent = true
where rule ->> 'excess_source' = 'true';

alter table public.categories drop constraint categories_rule_check;
alter table public.categories
  add constraint categories_rule_check
  check (rule is null or rule ->> 'type' in ('goal', 'capped_percent', 'remainder', 'excess', 'group_child'));

drop trigger categories_validate_excess_group on public.categories;

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
    if v_percent is null or v_percent <> v_percent or v_percent <= 0 or v_percent > 100 then
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

  return new;
end;
$$;

create trigger categories_validate_excess_group
  before insert or update of household_id, kind, rule, is_group_parent or delete on public.categories
  for each row execute function private.validate_excess_group_category();

-- Drop the old arity so all callers use the payday-aware helper. The payday
-- parameter lets a checked child row remain part of its already-fixed parent
-- split without using that row to reduce the child's room a second time.
drop function private.excess_group_allocations(uuid, numeric);

create function private.excess_group_allocations(
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
    coalesce(array_agg((c.rule ->> 'percent')::numeric order by c.sort_order, c.id), ARRAY[]::numeric[]),
    coalesce(sum((c.rule ->> 'percent')::numeric), 0)
  into v_ids, v_rules, v_percentages, v_total
  from public.categories c
  where c.household_id = (select household_id from public.categories where id = p_parent_id)
    and c.kind = 'fund'
    and c.rule ->> 'type' in ('excess', 'group_child')
    and c.rule ->> 'parent_id' = p_parent_id::text;

  if cardinality(v_ids) = 0 then
    return;
  end if;

  -- A zero parent has no fan-out, preserving the legacy no-op behavior. A
  -- positive parent still returns zero-valued children when a goal is full so
  -- an earlier pending payout is overwritten rather than left stale.
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
        -- Checked history is immutable and is still part of this payday's
        -- conservation total, even when it completed the nested goal.
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

-- The latest materialize_payday version, extended with the generic group
-- child helper while preserving checked-row immutability.
create or replace function public.materialize_payday(p_household_id uuid, p_payday_date date default null)
returns setof public.ledger_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payday date;
  v_month date;
  v_paydays date[];
  v_idx int;
  v_weights numeric[];
  i int;
  rec record;
  v_row public.ledger_entries;
  v_cats uuid[];
  v_totals numeric[];
  v_amounts numeric[];
  v_big int;
  v_source_amount numeric;
  v_child_total numeric;
  v_parent_checked boolean;
begin
  if not exists (select 1 from private.user_household_ids() h where h = p_household_id) then
    raise exception 'not a member of household %', p_household_id;
  end if;

  if (select h.auto_check_past_paydays from public.households h where h.id = p_household_id) then
    update public.ledger_entries
    set status = 'checked', checked_at = now()
    where household_id = p_household_id and status = 'pending' and amount <> 0
      and payday_date < current_date;
  end if;

  v_payday := coalesce(p_payday_date, private.next_payday(p_household_id));
  v_month := date_trunc('month', v_payday)::date;
  v_paydays := private.household_paydays_in_month(p_household_id, v_month);
  v_idx := array_position(v_paydays, v_payday);
  if v_idx is null then
    raise exception 'date % is not an active payday for household %', v_payday, p_household_id;
  end if;

  v_weights := array_fill(0::numeric, array[array_length(v_paydays, 1)]);
  for i in 1 .. array_length(v_paydays, 1) loop
    v_weights[i] := greatest(0, private.payday_leftover(p_household_id, v_paydays[i]));
  end loop;
  for rec in select c.from_payday, c.amount from public.payday_carries(p_household_id, v_month) c where c.from_payday is not null
  loop
    i := array_position(v_paydays, rec.from_payday);
    v_weights[i] := v_weights[i] - rec.amount;
  end loop;

  select coalesce(array_agg(ct.category_id), '{}'), coalesce(array_agg(ct.monthly_total), '{}')
  into v_cats, v_totals
  from private.compute_monthly_fund_totals(p_household_id, v_month) ct;

  v_amounts := array_fill(0::numeric, array[cardinality(v_cats)]);
  for i in 1 .. cardinality(v_cats) loop
    v_amounts[i] := (private.allocate_proportional(v_totals[i], v_weights))[v_idx];
    if v_big is null or v_amounts[i] > v_amounts[v_big] then
      v_big := i;
    end if;
  end loop;
  if v_big is not null
    and (select sum(t) from unnest(v_totals) t) = (select sum(w) from unnest(v_weights) w) then
    v_amounts[v_big] := v_amounts[v_big] + v_weights[v_idx] - (select sum(a) from unnest(v_amounts) a);
  end if;

  for i in 1 .. cardinality(v_cats) loop
    v_source_amount := v_amounts[i];
    select coalesce(sum(e.amount), 0)
      into v_child_total
    from private.excess_group_allocations(v_cats[i], v_source_amount, v_payday) e;

    select exists (
      select 1 from public.ledger_entries le
      where le.category_id = v_cats[i] and le.payday_date = v_payday
        and le.bill_item_id is null and not le.manual and le.status = 'checked'
    ) into v_parent_checked;

    insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
    values (p_household_id, v_cats[i], null, v_payday, v_source_amount - v_child_total, 'pending')
    on conflict (category_id, payday_date) where bill_item_id is null and not manual
    do update set amount = excluded.amount
      where public.ledger_entries.status <> 'checked'
    returning * into v_row;
    if found then
      return next v_row;
    end if;

    -- Checked parent/child rows are history. Pending rows may be adapted when
    -- a nested goal reaches its target, including being rewritten to zero.
    if not v_parent_checked then
      for rec in select e.category_id, e.amount from private.excess_group_allocations(v_cats[i], v_source_amount, v_payday) e
      loop
        insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
        values (p_household_id, rec.category_id, null, v_payday, rec.amount, 'pending')
        on conflict (category_id, payday_date) where bill_item_id is null and not manual
        do update set amount = excluded.amount
          where public.ledger_entries.status <> 'checked'
        returning * into v_row;
        if found then
          return next v_row;
        end if;
      end loop;
    end if;
  end loop;

  for rec in
    select bi.id as bill_item_id, bi.category_id, bi.amount
    from public.bill_items bi
    join public.categories c on c.id = bi.category_id
    where c.household_id = p_household_id and c.kind = 'bill'
      and private.clamp_day_to_month(bi.recurring_day, v_month) = v_payday
      and (bi.end_date is null or bi.end_date >= v_payday)
  loop
    insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
    values (p_household_id, rec.category_id, rec.bill_item_id, v_payday, rec.amount, 'pending')
    on conflict (category_id, bill_item_id, payday_date) where bill_item_id is not null
    do update set amount = excluded.amount
      where public.ledger_entries.status <> 'checked'
    returning * into v_row;
    if found then
      return next v_row;
    end if;
  end loop;

  return;
end;
$$;

-- Nested goals use the fixed parent percentage stream as their funding source.
-- The stream is capped at the child's remaining target room (Option B); its
-- deadline is used to report a shortfall without subtracting the parent pool
-- twice. one_time remains metadata for this fixed-share stream: a percentage
-- cannot take more than its parent's payday share in one go.
create function private.group_child_goal_shortfalls(p_household_id uuid, p_month date)
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
      v_expected := round(greatest(0, v_parent_monthly) * (rec.rule ->> 'percent')::numeric / 100);
      v_remaining := greatest(0, v_remaining - least(v_remaining, v_expected));
    end loop;

    category_id := rec.id;
    shortfall := v_remaining;
    return next;
  end loop;
end;
$$;

-- Keep direct goal planning unchanged, then add deadline-bearing group-child
-- goals to the same shortfall surface used by the checklist.
create or replace function public.goal_shortfalls(p_household_id uuid, p_date date default current_date)
returns table (category_id uuid, shortfall numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from private.user_household_ids() h where h = p_household_id) then
    raise exception 'not a member of household %', p_household_id;
  end if;

  return query
    select gp.category_id, gp.shortfall
    from private.goal_plan(p_household_id, date_trunc('month', p_date)::date) gp
    join public.categories c on c.id = gp.category_id
    where gp.shortfall > 0 and c.rule ->> 'target_date' is not null;

  return query
    select gp.category_id, gp.shortfall
    from private.group_child_goal_shortfalls(p_household_id, date_trunc('month', p_date)::date) gp
    where gp.shortfall > 0;
end;
$$;
