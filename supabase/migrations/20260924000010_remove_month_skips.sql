-- Remove the per-month fund skip (household's in-app feedback, 2026-09-23:
-- "Remove skip in staying money"). Reverses 20260920000003.
--
-- Recorded skips are migrated away rather than kept readable: with no Skip
-- button there is no way to un-skip, so a skip left in place would stick a
-- fund at ₱0 for the rest of its month. Skipped rows go back to 'pending';
-- the upcoming payday's amount is refilled the next time the checklist
-- re-materializes it (the upsert rewrites any non-checked row). Past paydays
-- are never re-materialized, so theirs stay ₱0 - out of the checklist count
-- and the streak like any other ₱0 fund row.
update public.ledger_entries set status = 'pending' where status = 'skipped';

alter table public.ledger_entries drop constraint ledger_entries_status_check;
alter table public.ledger_entries add constraint ledger_entries_status_check
  check (status in ('pending', 'checked'));

-- Unchanged from 20260923000020 except the category_month_skips lookup is gone.
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
    insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
    values (p_household_id, v_cats[i], null, v_payday, v_amounts[i], 'pending')
    on conflict (category_id, payday_date) where bill_item_id is null and not manual
    do update set amount = excluded.amount
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

drop table public.category_month_skips;
