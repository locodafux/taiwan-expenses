-- Multi-month forward projection for the month-by-month breakdown table
-- (captain's decision: reproduce taiwan-fund-planner.html's "Full numbers"
-- table for real). compute_monthly_fund_totals only ever answered "what does
-- this one month look like ASSUMING TODAY'S REAL BALANCE" - fine for the
-- single next payday materialize_payday actually writes, but wrong for any
-- OTHER month: tier 1 (goal) already plans forward correctly via goal_plan(),
-- but tier 2 (capped_percent) checked its cap against `checked` ledger rows
-- regardless of p_month, so asking "month 6" and "month 12" for a capped fund
-- both saw the same today's-balance answer instead of a balance that assumes
-- months 1-5 (or 1-11) already happened. Tier 3 (remainder) has no cap, so it
-- was already correct as a same-month split - it needs no change here.
--
-- private.fund_totals_plan(household_id, from_month, months) is the new
-- entry point: it plans a whole window at once, carrying a running projected
-- balance per capped_percent category across months (the same fix goal_plan
-- already made for goal categories), and reuses goal_plan(from_month)'s
-- returned array as-is for tier 1 rather than re-deriving it. Group/excess
-- children's own nested-goal cap check (private.excess_group_allocations) has
-- the identical live-balance limitation but is out of scope here - it stays
-- per-payday and unprojected.
--
-- compute_monthly_fund_totals(household_id, month) becomes a one-line wrapper
-- around fund_totals_plan(..., 1), so every existing caller (materialize_payday,
-- private.group_child_goal_shortfalls) sees byte-identical behaviour - months=1
-- collapses tier 2's running balance to the same real checked balance it
-- always started from.
create function private.fund_totals_plan(p_household_id uuid, p_from_month date, p_months int)
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
  v_paydays date[];
  v_alloc numeric[];
  v_last_remainder_id uuid;
  v_weight_sum numeric;
  v_running numeric;
  v_pct numeric;
  v_cap numeric;
  v_want numeric;
  v_room numeric;
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

  -- Tier 1: goal_plan already plans forward from v_from_month; a category's
  -- plan array may be shorter than p_months (its own window ends at its
  -- deadline) - coalesce the rest to 0, same as "goal fully funded, nothing
  -- more to contribute".
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

  -- Tier 2: capped_percent, walking the window month by month with a running
  -- projected balance per category (real checked balance strictly before
  -- v_from_month, then this plan's own contributions from there on).
  for rec in
    select c.id, c.rule
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

  -- Tier 3: remainder - no cap, so no running balance; each month is an
  -- independent weight-based split of that month's own pool, exactly as
  -- before. The highest-sort_order remainder category always absorbs
  -- whatever's left in a given month (v_tier3_committed accumulates in
  -- sort_order across this loop, so it's fully populated for every earlier
  -- category by the time the last one is reached, for every month at once).
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
    v_alloc := array_fill(0::numeric, array[p_months]);
    for m in 1..p_months loop
      if rec.id = v_last_remainder_id then
        v_alloc[m] := v_tier3_pool[m] - v_tier3_committed[m];
      else
        v_pct := coalesce((rec.rule ->> 'percent')::numeric, 0);
        if v_weight_sum > 0 then
          v_alloc[m] := round(v_tier3_pool[m] * v_pct / v_weight_sum);
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

create or replace function private.compute_monthly_fund_totals(p_household_id uuid, p_month date)
returns table (category_id uuid, monthly_total numeric)
language sql
stable
set search_path = ''
as $$
  select fp.category_id, fp.plan[1]
  from private.fund_totals_plan(p_household_id, date_trunc('month', p_month)::date, 1) fp;
$$;

-- Frontend entry point for the breakdown table: every fund category's
-- projected contribution for each of p_months months starting at
-- p_from_month (month_index 1 = p_from_month). SECURITY INVOKER + explicit
-- membership check, same pattern as public.goal_shortfalls.
create function public.fund_totals_forecast(p_household_id uuid, p_from_month date, p_months int default 12)
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
    from private.fund_totals_plan(p_household_id, date_trunc('month', p_from_month)::date, p_months) fp,
      generate_series(1, p_months) as gs(i);
end;
$$;

grant execute on function public.fund_totals_forecast(uuid, date, int) to authenticated;
