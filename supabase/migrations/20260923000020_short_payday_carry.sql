-- A short payday (bills due that day > its take-home) is carried by the
-- paydays BEFORE it, so every other payday puts all of its own leftover into
-- funds (in-app bug report 2026-09-23: "All categories have an allocated
-- money that will equal money that we received that cutoff"; captain's call:
-- option B).
--
-- Until now the month's fund pool already had the short payday's gap netted
-- out (compute_monthly_fund_totals sums signed leftovers), but the per-payday
-- split weighted every payday by max(0, leftover) - so each surplus payday
-- silently kept back a share of the gap that no checklist row showed (the
-- original planner's "absorbed by the other paydays", :677-700). Now the gap
-- is kept by the nearest earlier paydays, only what is left of a payday's
-- leftover is its weight, and the weights sum to exactly the month's pool.
-- Monthly fund totals and the goal plan are unchanged; only the split moves.

-- Who keeps money for which short payday this month (p_date's month): the
-- nearest earlier payday with room first, so it is kept before the day it is
-- needed; a month that opens short falls back to the paydays after it. A gap
-- no payday this month can cover comes back with from_payday null.
create function public.payday_carries(p_household_id uuid, p_date date)
returns table (from_payday date, to_payday date, amount numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_paydays date[] := private.household_paydays_in_month(p_household_id, date_trunc('month', p_date)::date);
  n int := coalesce(array_length(v_paydays, 1), 0);
  v_free numeric[];
  v_need numeric;
  v_take numeric;
  i int;
  j int;
begin
  if not exists (select 1 from private.user_household_ids() h where h = p_household_id) then
    raise exception 'not a member of household %', p_household_id;
  end if;

  for i in 1..n loop
    v_free[i] := private.payday_leftover(p_household_id, v_paydays[i]);
  end loop;

  for j in 1..n loop
    continue when v_free[j] >= 0;
    v_need := -v_free[j];
    for i in select k from generate_series(1, n) k where k <> j order by k > j, abs(k - j) loop
      v_take := least(v_need, greatest(0, v_free[i]));
      continue when v_take = 0;
      v_free[i] := v_free[i] - v_take;
      v_need := v_need - v_take;
      from_payday := v_paydays[i];
      to_payday := v_paydays[j];
      amount := v_take;
      return next;
      exit when v_need = 0;
    end loop;
    if v_need > 0 then
      from_payday := null;
      to_payday := v_paydays[j];
      amount := v_need;
      return next;
    end if;
  end loop;
end;
$$;

grant execute on function public.payday_carries(uuid, date) to authenticated;

-- Unchanged from 20260921000010 except: weights net out what a payday keeps
-- for a short one, and when the month's funds use the whole pool the
-- per-category rounding residue (a peso or two) goes to this payday's largest
-- fund, so the payday's rows add up to exactly its take-home.
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
  v_skipped boolean;
  v_cats uuid[];
  v_totals numeric[];
  v_amounts numeric[];
  v_big int;
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
    v_skipped := exists (
      select 1 from public.category_month_skips s
      where s.category_id = v_cats[i] and s.month = v_month
    );
    insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
    values (
      p_household_id, v_cats[i], null, v_payday,
      case when v_skipped then 0 else v_amounts[i] end,
      case when v_skipped then 'skipped' else 'pending' end
    )
    on conflict (category_id, payday_date) where bill_item_id is null and not manual
    do update set amount = excluded.amount, status = excluded.status
      where public.ledger_entries.status <> 'checked'
    returning * into v_row;
    -- Not FOUND when the conflicting row was already checked and left untouched.
    if found then
      return next v_row;
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
