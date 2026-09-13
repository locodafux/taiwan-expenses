-- Allocation engine (docs/plan.md §1 "the allocation engine — reproducing
-- allocateProportional"). Two phases:
--   Phase 1: each fund category's monthly total, by rule tier (goal ->
--            capped_percent -> remainder), draining a shared "available" pool.
--   Phase 2: allocate_proportional() splits that monthly total across the
--            month's paydays by cushion weight, remainder peso to the
--            largest-weight payday — a direct port of taiwan-fund-planner.html
--            :433-450 (allocateProportional) and :453-484 (fundAllocation).

-- A day-of-month clamped into a real calendar date (e.g. day 31 in a 30-day
-- month lands on the 30th), mirroring how the original's fixed PAYDAYS list
-- never needed clamping only because it never used day 29-31.
create function private.clamp_day_to_month(p_day int, p_month_start date)
returns date
language sql
immutable
as $$
  select least(
    date_trunc('month', p_month_start)::date + (p_day - 1),
    (date_trunc('month', p_month_start) + interval '1 month - 1 day')::date
  );
$$;

-- All distinct payday dates in p_month for this household's active incomes.
create function private.household_paydays_in_month(p_household_id uuid, p_month date)
returns date[]
language sql
stable
set search_path = ''
as $$
  select array_agg(distinct d order by d)
  from (
    select private.clamp_day_to_month(recurring_day, date_trunc('month', p_month)::date) as d
    from public.incomes
    where household_id = p_household_id and active
  ) days;
$$;

-- Cushion at one payday: that day's income minus bills/debts due that day
-- (:426-431 PAYDAY_TAKEHOME / EXPENSE_PAYDAY_TOTALS in the original).
create function private.payday_leftover(p_household_id uuid, p_payday_date date)
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
    ), 0);
$$;

-- Next payday on/after p_from, for materialize_payday's default.
create function private.next_payday(p_household_id uuid, p_from date default current_date)
returns date
language sql
stable
set search_path = ''
as $$
  with days as (
    select distinct recurring_day from public.incomes
    where household_id = p_household_id and active
  ),
  candidates as (
    select private.clamp_day_to_month(recurring_day, date_trunc('month', p_from)::date) as d from days
    union all
    select private.clamp_day_to_month(recurring_day, (date_trunc('month', p_from) + interval '1 month')::date) as d from days
  )
  select min(d) from candidates where d >= p_from;
$$;

-- Phase 2: taiwan-fund-planner.html:433-450, unchanged.
create function private.allocate_proportional(p_total numeric, p_weights numeric[])
returns numeric[]
language plpgsql
immutable
as $$
declare
  n int := array_length(p_weights, 1);
  sum_w numeric := 0;
  out_arr numeric[] := array_fill(0::numeric, array[n]);
  i int;
  even_share numeric;
  diff numeric;
  max_i int := 1;
begin
  if p_total <= 0 then
    return out_arr;
  end if;

  for i in 1..n loop
    sum_w := sum_w + p_weights[i];
  end loop;

  if sum_w <= 0 then
    even_share := floor(p_total / n);
    for i in 1..n loop
      out_arr[i] := even_share;
    end loop;
    out_arr[n] := out_arr[n] + (p_total - even_share * n);
    return out_arr;
  end if;

  for i in 1..n loop
    out_arr[i] := round(p_total * p_weights[i] / sum_w);
  end loop;

  diff := p_total;
  for i in 1..n loop
    diff := diff - out_arr[i];
  end loop;

  for i in 2..n loop
    if p_weights[i] > p_weights[max_i] then
      max_i := i;
    end if;
  end loop;
  out_arr[max_i] := out_arr[max_i] + diff;

  return out_arr;
end;
$$;

-- Phase 1: monthly total per fund category, tiered goal -> capped_percent ->
-- remainder (docs/plan.md §1's three-tier table), draining a shared pool.
create function private.compute_monthly_fund_totals(p_household_id uuid, p_month date)
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
  v_remaining_target numeric;
  v_remaining_periods int;
  v_target_date date;
  v_months_diff int;
  v_even_share numeric;
  v_contribution numeric;
  v_tier1_leftover numeric;
  v_tier2_committed numeric := 0;
  v_want numeric;
  v_room numeric;
  v_cap numeric;
  v_pct numeric;
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

  -- Tier 1: goal (:365-391 TAIWAN water-fill; generalized to N goal
  -- categories, each draining the shared pool for the next in sort_order,
  -- same as Pinatubo draining the pool before Taiwan in the original).
  for rec in
    select c.id, c.rule
    from public.categories c
    where c.household_id = p_household_id and c.kind = 'fund' and not c.archived
      and c.rule ->> 'type' = 'goal'
    order by c.sort_order
  loop
    select coalesce(sum(amount), 0) into v_balance
    from public.ledger_entries le
    where le.household_id = p_household_id and le.category_id = rec.id and le.status = 'checked';

    v_remaining_target := greatest(0, (rec.rule ->> 'target_amount')::numeric - v_balance);

    if v_remaining_target = 0 then
      v_contribution := 0;
    else
      v_target_date := (rec.rule ->> 'target_date')::date;
      if v_target_date is not null then
        -- Periods run up to (not including) the target's month, same as the
        -- original's 5-month Oct-Feb save window ahead of the Mar 5 deadline
        -- (:365-367 "one month of safety margin before the Mar 5 deadline").
        v_months_diff := (extract(year from age(date_trunc('month', v_target_date), v_month_start)) * 12
          + extract(month from age(date_trunc('month', v_target_date), v_month_start)))::int;
        v_remaining_periods := greatest(1, v_months_diff);
      else
        v_remaining_periods := 1;
      end if;
      -- floor, like the original's Math.floor(evenShare) (:388), so a
      -- fractional even split never overshoots this period's real leftover.
      v_even_share := floor(v_remaining_target / v_remaining_periods);
      v_contribution := least(v_remaining_target, greatest(0, v_even_share), greatest(0, v_available));
    end if;

    v_available := v_available - v_contribution;
    category_id := rec.id;
    monthly_total := v_contribution;
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
  -- highest-sort_order remainder category always absorbs whatever's left,
  -- exactly like EXCESS's `remainder - ef - sav` in the original — this is
  -- what guarantees the tier always sums to exactly v_tier3_pool.
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

-- The callable entry point (docs/plan.md §4: "a callable function, not a
-- cron job"). SECURITY INVOKER on purpose: it only ever touches the caller's
-- own household, which their existing RLS grants already cover, so there is
-- no reason to run it with elevated privileges.
create function public.materialize_payday(p_household_id uuid, p_payday_date date default null)
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
  v_amounts numeric[];
  rec record;
  v_row public.ledger_entries;
begin
  if not exists (select 1 from private.user_household_ids() h where h = p_household_id) then
    raise exception 'not a member of household %', p_household_id;
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

  for rec in select ct.category_id, ct.monthly_total from private.compute_monthly_fund_totals(p_household_id, v_month) ct
  loop
    v_amounts := private.allocate_proportional(rec.monthly_total, v_weights);
    insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
    values (p_household_id, rec.category_id, null, v_payday, v_amounts[v_idx], 'pending')
    on conflict (category_id, payday_date) where bill_item_id is null
    do update set amount = excluded.amount
    returning * into v_row;
    return next v_row;
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
    returning * into v_row;
    return next v_row;
  end loop;

  return;
end;
$$;

grant execute on function public.materialize_payday(uuid, date) to authenticated;
