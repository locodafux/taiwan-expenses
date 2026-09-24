-- Opt-in household setting (captain 2026-09-23: "auto check the checklist if
-- the cutoff is changing"): once a payday is in the past, its still-pending
-- checklist rows are ticked off, so a forgotten row doesn't leave that payday
-- incomplete forever (the checklist only ever shows the upcoming payday, so
-- nothing past it can be ticked by hand). Off by default.
alter table public.households
  add column auto_check_past_paydays boolean not null default false;

-- Auto-ticked rows have no checker (checked_by null); only a person's tick
-- is partner activity, otherwise the sweep would push "X paid ..." for every
-- swept bill.
drop trigger ledger_entries_notify_bill_checked on public.ledger_entries;
create trigger ledger_entries_notify_bill_checked
  after update of status on public.ledger_entries
  for each row
  when (new.status = 'checked' and old.status <> 'checked' and new.bill_item_id is not null
        and new.checked_by is not null)
  execute function private.notify_bill_checked();

-- Unchanged from 20260924000010_remove_month_skips except the sweep right
-- after the membership check. It runs here because every client opening the
-- checklist calls this, so it happens the same way whoever opens the app
-- first. "Past" is before today (the database's date): a payday stays
-- current all day. ₱0 rows (nothing to set aside, including formerly
-- skipped funds) stay pending - they're out of the checklist count and the
-- streak, and ticking them would add ₱0 lines to category history.
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
