-- Per-category start and end month (captain's ask 2026-09-30: "in categories
-- add a month when to start and end of month to last").
--
-- start_month / end_month are first-of-month dates: the category exists from
-- the start of start_month through the end of end_month (null = ongoing).
-- Existing rows all get start_month = 2026-10-01 (the app's first month,
-- APP_START_MONTH) via the column default and end_month = null, so nothing
-- they show changes.
--
-- Outside its range a category is treated as if it did not exist that month:
-- no fund allocation, no goal/forecast slice, no bill schedule, no reminder.
-- bill_items.end_date stays what it always was (one item's last due date) -
-- this is a second, category-level gate layered on top of it, via one helper.
--
-- Additive only: two columns, one check constraint, one helper; every
-- function below is CREATE OR REPLACE with the same signature and its old
-- behaviour whenever a category is in range (the default for everything that
-- exists today).
-- Rollback: drop the constraint and both columns, then re-apply the previous
-- definitions of the functions replaced here (payday_leftover: 20260913000004,
-- goal_plan / goal_shortfalls' first query: 20260921000050 / 20260926000002,
-- fund_totals_plan + fund_totals_forecast: 20260927000001,
-- excess_group_allocations: 20260926000002, compute_payday_entries:
-- 20260928000001, send_daily_reminders: 20260921000040).

alter table public.categories
  add column start_month date not null default '2026-10-01',
  add column end_month date,
  add constraint categories_month_range check (
    extract(day from start_month) = 1
    and (end_month is null or (extract(day from end_month) = 1 and end_month >= start_month))
  );

-- True when the calendar month containing p_month is inside [p_start, p_end].
create function private.category_in_range(p_start date, p_end date, p_month date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select date_trunc('month', p_month)::date >= p_start
    and (p_end is null or date_trunc('month', p_month)::date <= p_end);
$$;

-- Bills of an out-of-range bill category are not due, so they no longer eat
-- into that payday's cushion (which feeds the goal plan, the forecast, the
-- payday split and payday_carries).
create or replace function private.payday_leftover(p_household_id uuid, p_payday_date date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select
    coalesce((
      select sum(amount) from public.incomes
      where household_id = p_household_id and active
        and private.clamp_day_to_month(recurring_day, date_trunc('month', p_payday_date)::date) = p_payday_date
    ), 0)
    -
    coalesce((
      select sum(bi.amount)
      from public.bill_items bi
      join public.categories c on c.id = bi.category_id
      where c.household_id = p_household_id and c.kind = 'bill'
        and private.clamp_day_to_month(bi.recurring_day, date_trunc('month', p_payday_date)::date) = p_payday_date
        and (bi.end_date is null or bi.end_date >= p_payday_date)
        and private.category_in_range(c.start_month, c.end_month, p_payday_date)
    ), 0);
$$;

-- Goal tier: a goal can only be funded from months inside its own range, so
-- its window's room is zeroed for every month outside it (water_fill and the
-- one-time pick already skip zero-room months). Otherwise identical to
-- 20260921000050.
create or replace function private.goal_plan(p_household_id uuid, p_month date)
returns table (category_id uuid, plan numeric[], shortfall numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', p_month)::date;
  v_horizon int := 1;
  v_rooms numeric[];
  v_window numeric[];
  v_alloc numeric[];
  v_paydays date[];
  v_periods int;
  v_remaining numeric;
  v_first int;
  rec record;
  m int;
  i int;
begin
  select greatest(1, coalesce(max(
    (extract(year from age(date_trunc('month', (c.rule ->> 'target_date')::date), v_month_start)) * 12
      + extract(month from age(date_trunc('month', (c.rule ->> 'target_date')::date), v_month_start)))::int
  ), 1)) into v_horizon
  from public.categories c
  where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
    and c.rule ->> 'type' = 'goal';

  v_rooms := array_fill(0::numeric, array[v_horizon]);
  for m in 1..v_horizon loop
    v_paydays := private.household_paydays_in_month(p_household_id, (v_month_start + make_interval(months => m - 1))::date);
    for i in 1..coalesce(array_length(v_paydays, 1), 0) loop
      v_rooms[m] := v_rooms[m] + private.payday_leftover(p_household_id, v_paydays[i]);
    end loop;
    v_rooms[m] := greatest(0, v_rooms[m]);
  end loop;

  for rec in
    select c.id, c.rule, c.start_month, c.end_month,
      coalesce((c.rule ->> 'one_time')::boolean, false) as one_time,
      greatest(0, (c.rule ->> 'target_amount')::numeric - coalesce((
        select sum(le.amount) from public.ledger_entries le
        where le.category_id = c.id and le.status = 'checked' and le.payday_date < v_month_start
      ), 0)) as remaining
    from public.categories c
    where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
      and c.rule ->> 'type' = 'goal'
    order by coalesce((c.rule ->> 'one_time')::boolean, false) desc, c.sort_order
  loop
    if (rec.rule ->> 'target_date') is null then
      v_periods := 1;
    else
      v_periods := greatest(1, (
        extract(year from age(date_trunc('month', (rec.rule ->> 'target_date')::date), v_month_start)) * 12
        + extract(month from age(date_trunc('month', (rec.rule ->> 'target_date')::date), v_month_start)))::int);
    end if;
    v_window := v_rooms[1:v_periods];
    for m in 1..v_periods loop
      if not private.category_in_range(rec.start_month, rec.end_month, (v_month_start + make_interval(months => m - 1))::date) then
        v_window[m] := 0;
      end if;
    end loop;
    v_remaining := rec.remaining;
    v_alloc := array_fill(0::numeric, array[v_periods]);

    if rec.one_time then
      select min(w.ord) into v_first from unnest(v_window) with ordinality w(room, ord) where w.room >= v_remaining;
    else
      v_first := null;
    end if;

    if v_first is not null then
      v_alloc[v_first] := v_remaining;
    else
      v_alloc := private.water_fill(v_remaining, v_window);
    end if;

    for m in 1..v_periods loop
      v_rooms[m] := v_rooms[m] - v_alloc[m];
      v_remaining := v_remaining - v_alloc[m];
    end loop;

    category_id := rec.id;
    plan := v_alloc;
    shortfall := v_remaining;
    return next;
  end loop;
end;
$$;

-- Capped and remainder tiers: an out-of-range category contributes 0 that
-- month, and the remainder split is over the remainder categories actually in
-- range that month (the last one of them absorbs the rounding residue).
-- Otherwise identical to 20260927000001.
create or replace function private.fund_totals_plan(p_household_id uuid, p_from_month date, p_months int)
returns table (category_id uuid, plan numeric[])
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from_month date := date_trunc('month', p_from_month)::date;
  v_rooms numeric[] := array_fill(0::numeric, array[p_months]);
  v_tier1_total numeric[] := array_fill(0::numeric, array[p_months]);
  v_tier1_leftover numeric[] := array_fill(0::numeric, array[p_months]);
  v_tier2_total numeric[] := array_fill(0::numeric, array[p_months]);
  v_tier3_pool numeric[] := array_fill(0::numeric, array[p_months]);
  v_tier3_committed numeric[] := array_fill(0::numeric, array[p_months]);
  v_last_remainder_ids uuid[] := array_fill(null::uuid, array[p_months]);
  v_weight_sums numeric[] := array_fill(0::numeric, array[p_months]);
  v_paydays date[];
  v_alloc numeric[];
  v_running numeric;
  v_pct numeric;
  v_cap numeric;
  v_want numeric;
  v_room numeric;
  v_month date;
  rec record;
  m int;
  i int;
begin
  if p_months < 1 then
    return;
  end if;

  for m in 1..p_months loop
    v_paydays := private.household_paydays_in_month(p_household_id, (v_from_month + make_interval(months => m - 1))::date);
    for i in 1..coalesce(array_length(v_paydays, 1), 0) loop
      v_rooms[m] := v_rooms[m] + private.payday_leftover(p_household_id, v_paydays[i]);
    end loop;
    v_rooms[m] := greatest(0, v_rooms[m]);
  end loop;

  for rec in select gp.category_id, gp.plan from private.goal_plan(p_household_id, v_from_month) gp
  loop
    v_alloc := array_fill(0::numeric, array[p_months]);
    for m in 1..p_months loop
      v_alloc[m] := coalesce(rec.plan[m], 0);
      v_tier1_total[m] := v_tier1_total[m] + v_alloc[m];
    end loop;
    category_id := rec.category_id;
    plan := v_alloc;
    return next;
  end loop;

  for m in 1..p_months loop
    v_tier1_leftover[m] := v_rooms[m] - v_tier1_total[m];
  end loop;

  for rec in
    select c.id, c.rule, c.start_month, c.end_month
    from public.categories c
    where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
      and c.rule ->> 'type' = 'capped_percent'
    order by c.sort_order
  loop
    select coalesce(sum(amount), 0) into v_running
    from public.ledger_entries le
    where le.household_id = p_household_id and le.category_id = rec.id and le.status = 'checked'
      and le.payday_date < v_from_month;

    v_pct := (rec.rule ->> 'percent')::numeric / 100;
    v_cap := (rec.rule ->> 'cap')::numeric;
    v_alloc := array_fill(0::numeric, array[p_months]);
    for m in 1..p_months loop
      v_month := (v_from_month + make_interval(months => m - 1))::date;
      continue when not private.category_in_range(rec.start_month, rec.end_month, v_month);
      v_want := round(v_tier1_leftover[m] * v_pct);
      if v_cap is not null then
        v_room := greatest(0, v_cap - v_running);
      else
        v_room := v_want;
      end if;
      v_alloc[m] := least(v_want, v_room);
      v_running := v_running + v_alloc[m];
      v_tier2_total[m] := v_tier2_total[m] + v_alloc[m];
    end loop;
    category_id := rec.id;
    plan := v_alloc;
    return next;
  end loop;

  for m in 1..p_months loop
    v_tier3_pool[m] := v_tier1_leftover[m] - v_tier2_total[m];
  end loop;

  -- Which remainder categories are in range each month decides the split's
  -- weights and who absorbs the residue (the highest sort_order among them).
  for rec in
    select c.id, c.rule, c.start_month, c.end_month
    from public.categories c
    where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
      and c.rule ->> 'type' = 'remainder'
    order by c.sort_order
  loop
    for m in 1..p_months loop
      v_month := (v_from_month + make_interval(months => m - 1))::date;
      if private.category_in_range(rec.start_month, rec.end_month, v_month) then
        v_last_remainder_ids[m] := rec.id;
        v_weight_sums[m] := v_weight_sums[m] + coalesce((rec.rule ->> 'percent')::numeric, 0);
      end if;
    end loop;
  end loop;

  for rec in
    select c.id, c.rule, c.start_month, c.end_month
    from public.categories c
    where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
      and c.rule ->> 'type' = 'remainder'
    order by c.sort_order
  loop
    v_alloc := array_fill(0::numeric, array[p_months]);
    for m in 1..p_months loop
      v_month := (v_from_month + make_interval(months => m - 1))::date;
      continue when not private.category_in_range(rec.start_month, rec.end_month, v_month);
      if rec.id = v_last_remainder_ids[m] then
        v_alloc[m] := v_tier3_pool[m] - v_tier3_committed[m];
      else
        v_pct := coalesce((rec.rule ->> 'percent')::numeric, 0);
        if v_weight_sums[m] > 0 then
          v_alloc[m] := round(v_tier3_pool[m] * v_pct / v_weight_sums[m]);
        else
          v_alloc[m] := 0;
        end if;
        v_tier3_committed[m] := v_tier3_committed[m] + v_alloc[m];
      end if;
    end loop;
    category_id := rec.id;
    plan := v_alloc;
    return next;
  end loop;
end;
$$;

-- The breakdown/summary forecast has no row for a category in a month outside
-- its range (same as it not existing that month), rather than a 0.
create or replace function public.fund_totals_forecast(p_household_id uuid, p_from_month date, p_months int default 12)
returns table (category_id uuid, month_index int, amount numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from private.user_household_ids() h where h = p_household_id) then
    raise exception 'not a member of household %', p_household_id;
  end if;
  if p_months < 1 or p_months > 36 then
    raise exception 'p_months must be between 1 and 36';
  end if;

  return query
    select fp.category_id, gs.i, fp.plan[gs.i]
    from private.fund_totals_plan(p_household_id, date_trunc('month', p_from_month)::date, p_months) fp
    join public.categories c on c.id = fp.category_id
    cross join generate_series(1, p_months) as gs(i)
    where private.category_in_range(
      c.start_month, c.end_month,
      (date_trunc('month', p_from_month)::date + make_interval(months => gs.i - 1))::date
    );
end;
$$;

-- A linked fund outside its range takes no share of its parent's payday (the
-- share stays in the parent, like any unclaimed percentage).
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
    coalesce(array_agg((c.rule ->> 'percent')::numeric order by c.sort_order, c.id), ARRAY[]::numeric[]),
    coalesce(sum((c.rule ->> 'percent')::numeric), 0)
  into v_ids, v_rules, v_percentages, v_total
  from public.categories c
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

-- materialize_payday and preview_payday both read this: an out-of-range fund
-- gets no row (and no linked-child fan-out), an out-of-range bill category
-- gets no bill rows. Otherwise identical to 20260928000001.
create or replace function private.compute_payday_entries(p_household_id uuid, p_payday_date date)
returns table (category_id uuid, bill_item_id uuid, amount numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_payday_date)::date;
  v_paydays date[] := private.household_paydays_in_month(p_household_id, v_month);
  v_idx int := array_position(v_paydays, p_payday_date);
  v_weights numeric[];
  i int;
  rec record;
  v_cats uuid[];
  v_totals numeric[];
  v_amounts numeric[];
  v_big int;
  v_source_amount numeric;
  v_child_total numeric;
  v_parent_checked boolean;
begin
  if v_idx is null then
    raise exception 'date % is not an active payday for household %', p_payday_date, p_household_id;
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
  from private.compute_monthly_fund_totals(p_household_id, v_month) ct
  join public.categories c on c.id = ct.category_id
  where private.category_in_range(c.start_month, c.end_month, v_month);

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
    from private.excess_group_allocations(v_cats[i], v_source_amount, p_payday_date) e;

    select exists (
      select 1 from public.ledger_entries le
      where le.category_id = v_cats[i] and le.payday_date = p_payday_date
        and le.bill_item_id is null and not le.manual and le.status = 'checked'
    ) into v_parent_checked;

    category_id := v_cats[i];
    bill_item_id := null;
    amount := v_source_amount - v_child_total;
    return next;

    if not v_parent_checked then
      for rec in select e.category_id, e.amount from private.excess_group_allocations(v_cats[i], v_source_amount, p_payday_date) e
      loop
        category_id := rec.category_id;
        bill_item_id := null;
        amount := rec.amount;
        return next;
      end loop;
    end if;
  end loop;

  for rec in
    select bi.id as bill_item_id, bi.category_id, bi.amount
    from public.bill_items bi
    join public.categories c on c.id = bi.category_id
    where c.household_id = p_household_id and c.kind = 'bill'
      and private.clamp_day_to_month(bi.recurring_day, v_month) = p_payday_date
      and (bi.end_date is null or bi.end_date >= p_payday_date)
      and private.category_in_range(c.start_month, c.end_month, p_payday_date)
  loop
    category_id := rec.category_id;
    bill_item_id := rec.bill_item_id;
    amount := rec.amount;
    return next;
  end loop;

  return;
end;
$$;

-- The checklist's shortfall callout skips a goal that is not running as of
-- the month asked about. Otherwise identical to 20260926000002.
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
    where gp.shortfall > 0 and c.rule ->> 'target_date' is not null
      and private.category_in_range(c.start_month, c.end_month, p_date);

  return query
    select gp.category_id, gp.shortfall
    from private.group_child_goal_shortfalls(p_household_id, date_trunc('month', p_date)::date) gp
    join public.categories c on c.id = gp.category_id
    where gp.shortfall > 0
      and private.category_in_range(c.start_month, c.end_month, p_date);
end;
$$;

-- No "bill due tomorrow" push for a bill whose category is out of range.
-- Otherwise identical to 20260921000040 (the cron schedule is unchanged).
create or replace function private.send_daily_reminders(p_today date default (now() at time zone 'Asia/Taipei')::date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tomorrow date := p_today + 1;
  rec record;
begin
  for rec in
    select c.household_id,
           count(*) as n,
           string_agg(bi.label || ' ' || private.peso(bi.amount), ', ' order by bi.label) as bills
    from public.bill_items bi
    join public.categories c on c.id = bi.category_id
    where c.kind = 'bill' and not c.archived
      and private.clamp_day_to_month(bi.recurring_day, v_tomorrow) = v_tomorrow
      and (bi.end_date is null or bi.end_date >= v_tomorrow)
      and private.category_in_range(c.start_month, c.end_month, v_tomorrow)
      and not exists (
        select 1 from public.ledger_entries le
        where le.bill_item_id = bi.id and le.payday_date = v_tomorrow and le.status = 'checked'
      )
    group by c.household_id
  loop
    perform private.push_to_household(
      rec.household_id, null,
      case when rec.n = 1 then 'Bill due tomorrow' else rec.n || ' bills due tomorrow' end,
      rec.bills
    );
  end loop;

  for rec in
    select distinct i.household_id
    from public.incomes i
    where i.active and private.clamp_day_to_month(i.recurring_day, p_today) = p_today
  loop
    perform private.push_to_household(
      rec.household_id, null,
      case
        when (private.household_paydays_in_month(rec.household_id, p_today))[1] = p_today
          then 'New month, new checklist'
        else 'Payday checklist ready'
      end,
      'It''s payday - your checklist is ready. Open the app to set aside this payday''s bills and savings.'
    );
  end loop;
end;
$$;
