-- "Complete by November" means the money is in during November, so the linked
-- fund's shortfall warning now counts the deadline month (it stopped one month
-- short, so Pinatubo and TAIWAN FUND warned about money the plan does deliver).
-- It also counts only checked rows from months BEFORE the one being viewed,
-- like private.goal_plan: this month's full pool is still counted as coming, so
-- subtracting what was already ticked this month double-counted it and made the
-- warning shrink as paydays were ticked. Otherwise identical to 20260930000003.
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
          and le.payday_date < v_month_start
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
    )::int + 1);
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
