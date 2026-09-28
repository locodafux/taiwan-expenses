-- Preview an upcoming payday's checklist (in-app feedback 2026-09-28: "when
-- I click the review for upcoming payday I should be able to see the
-- checklist under that payday"). Only the next payday is ever materialized
-- (AGENTS.md), so a further-out payday the dashboard's stepper can reach has
-- no ledger_entries rows yet, and computing them with materialize_payday
-- would write real pending rows for a payday that hasn't happened - letting
-- it be checked off early and, if re-opened later with different inputs,
-- silently rewriting what a still-pending row says a past payday was.
--
-- private.compute_payday_entries is materialize_payday's read side pulled out
-- unchanged (same weights, same monthly totals, same group/excess fan-out,
-- same bill-item selection) so the preview can share the exact algorithm
-- instead of a second copy of it. materialize_payday now just upserts
-- whatever that function returns.

create function private.compute_payday_entries(p_household_id uuid, p_payday_date date)
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

    -- Checked parent/child rows are history and stay out of a still-open
    -- preview the same way materialize_payday leaves them alone.
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
  loop
    category_id := rec.category_id;
    bill_item_id := rec.bill_item_id;
    amount := rec.amount;
    return next;
  end loop;

  return;
end;
$$;

create or replace function public.materialize_payday(p_household_id uuid, p_payday_date date default null)
returns setof public.ledger_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payday date;
  rec record;
  v_row public.ledger_entries;
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

  for rec in select * from private.compute_payday_entries(p_household_id, v_payday) loop
    if rec.bill_item_id is null then
      insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
      values (p_household_id, rec.category_id, null, v_payday, rec.amount, 'pending')
      on conflict (category_id, payday_date) where bill_item_id is null and not manual
      do update set amount = excluded.amount
        where public.ledger_entries.status <> 'checked'
      returning * into v_row;
    else
      insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
      values (p_household_id, rec.category_id, rec.bill_item_id, v_payday, rec.amount, 'pending')
      on conflict (category_id, bill_item_id, payday_date) where bill_item_id is not null
      do update set amount = excluded.amount
        where public.ledger_entries.status <> 'checked'
      returning * into v_row;
    end if;
    if found then
      return next v_row;
    end if;
  end loop;

  return;
end;
$$;

-- Read-only counterpart the dashboard's payday stepper calls for a payday
-- further out than the next one: same numbers materialize_payday would write,
-- without writing them.
create function public.preview_payday(p_household_id uuid, p_payday_date date)
returns table (category_id uuid, bill_item_id uuid, amount numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from private.user_household_ids() h where h = p_household_id) then
    raise exception 'not a member of household %', p_household_id;
  end if;

  return query select * from private.compute_payday_entries(p_household_id, p_payday_date);
end;
$$;

grant execute on function public.preview_payday(uuid, date) to authenticated;
