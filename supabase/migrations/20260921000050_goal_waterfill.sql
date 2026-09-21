-- Goal tier, take two: one-time goals and real water-filling.
--
-- 20260913000004's goal tier only ever looked at the current month (even
-- share = remaining / months left, capped by this month's leftover), so a lean
-- month's shortfall silently rolled onto whatever month came next. It now
-- plans every goal across the months up to its deadline, using each month's
-- projected leftover (private.payday_leftover summed over the month's
-- paydays - incomes minus bills due, honouring bill end_dates):
--
--   1. one-time goals (rule.one_time = true, e.g. a trip), in sort_order:
--      the whole remaining amount comes out of the earliest month before the
--      due date that can cover it; if no single month can, it is water-filled
--      across the months before the due date so it still gets fully funded.
--   2. every other goal, in sort_order: water-filled across the months before
--      its deadline (one month of buffer, same window as before) over what
--      the one-time goals and earlier goals left in each month.
--
-- Only this month's slice of the plan is committed; the plan is rebuilt every
-- time from checked balances, so it keeps adapting to what was actually saved.
-- capped_percent and remainder tiers are unchanged.

-- Water-fill p_total across months with p_rooms room each: flat share of what
-- is left; a month that can't cover it gives all it has and drops out; repeat;
-- the rest is split evenly. Never exceeds a month's room; if total room is too
-- small every month just gives all it has (the caller sees the shortfall).
-- The even split is floor(T*(k+1)/n) - floor(T*k/n): each month gets the
-- floor or ceiling of the share, the first month the floor (like the
-- original's Math.floor(evenShare), :388) and nothing is lost to rounding.
create function private.water_fill(p_total numeric, p_rooms numeric[])
returns numeric[]
language plpgsql
immutable
as $$
declare
  n int := coalesce(array_length(p_rooms, 1), 0);
  out_arr numeric[] := array_fill(0::numeric, array[n]);
  active bool[] := array_fill(true, array[n]);
  v_left numeric := greatest(0, p_total);
  v_count int;
  v_share numeric;
  v_dropped bool;
  k int;
  i int;
begin
  if n = 0 then
    return out_arr;
  end if;

  for i in 1..n loop
    if coalesce(p_rooms[i], 0) <= 0 then
      active[i] := false;
    end if;
  end loop;

  loop
    select count(*) into v_count from unnest(active) a where a;
    exit when v_count = 0 or v_left <= 0;
    v_share := v_left / v_count;
    v_dropped := false;
    for i in 1..n loop
      if active[i] and p_rooms[i] < v_share then
        out_arr[i] := p_rooms[i];
        v_left := v_left - p_rooms[i];
        active[i] := false;
        v_dropped := true;
      end if;
    end loop;
    if not v_dropped then
      k := 0;
      for i in 1..n loop
        if active[i] then
          out_arr[i] := floor(v_left * (k + 1) / v_count) - floor(v_left * k / v_count);
          k := k + 1;
        end if;
      end loop;
      exit;
    end if;
  end loop;

  return out_arr;
end;
$$;

-- The goal plan for p_month onward: per goal category, its amount for each
-- month in its window (plan[1] = p_month) and the shortfall (what the months
-- before its deadline can't cover).
-- Balances are checked entries from before p_month, so every payday in a
-- month sees the same monthly total no matter which of them were ticked off.
create function private.goal_plan(p_household_id uuid, p_month date)
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
  -- Months in the plan: this one through the last month before any deadline.
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
    select c.id, c.rule,
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
    -- Periods run up to (not including) the target's month - the original's
    -- one month of safety margin (:365-367). No deadline, or a deadline this
    -- month or earlier: this month is the only period.
    if (rec.rule ->> 'target_date') is null then
      v_periods := 1;
    else
      v_periods := greatest(1, (
        extract(year from age(date_trunc('month', (rec.rule ->> 'target_date')::date), v_month_start)) * 12
        + extract(month from age(date_trunc('month', (rec.rule ->> 'target_date')::date), v_month_start)))::int);
    end if;
    v_window := v_rooms[1:v_periods];
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

-- Same function as 20260913000004 with tier 1 swapped for goal_plan().
create or replace function private.compute_monthly_fund_totals(p_household_id uuid, p_month date)
returns table (category_id uuid, monthly_total numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', p_month)::date;
  v_paydays date[] := private.household_paydays_in_month(p_household_id, v_month_start);
  v_available numeric := 0;
  rec record;
  v_balance numeric;
  v_tier1_leftover numeric;
  v_tier2_committed numeric := 0;
  v_want numeric;
  v_room numeric;
  v_cap numeric;
  v_pct numeric;
  v_contribution numeric;
  v_tier3_pool numeric;
  v_tier3_committed numeric := 0;
  v_last_remainder_id uuid;
  v_weight_sum numeric;
  i int;
begin
  if v_paydays is null or array_length(v_paydays, 1) is null then
    return;
  end if;

  for i in 1 .. array_length(v_paydays, 1) loop
    v_available := v_available + private.payday_leftover(p_household_id, v_paydays[i]);
  end loop;

  -- Tier 1: goal (one-time first, then deadline goals - see goal_plan()).
  for rec in select gp.category_id, gp.plan[1] as this_month from private.goal_plan(p_household_id, v_month_start) gp
  loop
    v_available := v_available - rec.this_month;
    category_id := rec.category_id;
    monthly_total := rec.this_month;
    return next;
  end loop;

  v_tier1_leftover := v_available;

  -- Tier 2: capped_percent (:398-409 EMERGENCY, 30% capped at ₱100,000).
  for rec in
    select c.id, c.rule
    from public.categories c
    where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
      and c.rule ->> 'type' = 'capped_percent'
    order by c.sort_order
  loop
    select coalesce(sum(amount), 0) into v_balance
    from public.ledger_entries le
    where le.household_id = p_household_id and le.category_id = rec.id and le.status = 'checked';

    v_pct := (rec.rule ->> 'percent')::numeric / 100;
    v_want := round(v_tier1_leftover * v_pct);

    if (rec.rule ->> 'cap') is not null then
      v_cap := (rec.rule ->> 'cap')::numeric;
      v_room := greatest(0, v_cap - v_balance);
    else
      v_room := v_want;
    end if;

    v_contribution := least(v_want, v_room);
    v_tier2_committed := v_tier2_committed + v_contribution;

    category_id := rec.id;
    monthly_total := v_contribution;
    return next;
  end loop;

  v_tier3_pool := v_tier1_leftover - v_tier2_committed;

  -- Tier 3: remainder (:407-409 SAVINGS 50%, EXCESS 20% + residual). The
  -- highest-sort_order remainder category always absorbs whatever's left.
  select c.id into v_last_remainder_id
  from public.categories c
  where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
    and c.rule ->> 'type' = 'remainder'
  order by c.sort_order desc
  limit 1;

  select coalesce(sum((c.rule ->> 'percent')::numeric), 0) into v_weight_sum
  from public.categories c
  where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
    and c.rule ->> 'type' = 'remainder';

  for rec in
    select c.id, c.rule
    from public.categories c
    where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
      and c.rule ->> 'type' = 'remainder'
    order by c.sort_order
  loop
    if rec.id = v_last_remainder_id then
      v_contribution := v_tier3_pool - v_tier3_committed;
    else
      v_pct := coalesce((rec.rule ->> 'percent')::numeric, 0);
      if v_weight_sum > 0 then
        v_contribution := round(v_tier3_pool * v_pct / v_weight_sum);
      else
        v_contribution := 0;
      end if;
      v_tier3_committed := v_tier3_committed + v_contribution;
    end if;

    category_id := rec.id;
    monthly_total := v_contribution;
    return next;
  end loop;
end;
$$;

-- Goals the months before their deadline can't fully fund, as of the month
-- p_date falls in - the checklist's shortfall callout. SECURITY INVOKER like
-- materialize_payday: it only reads the caller's own household.
create function public.goal_shortfalls(p_household_id uuid, p_date date default current_date)
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
end;
$$;

grant execute on function public.goal_shortfalls(uuid, date) to authenticated;
