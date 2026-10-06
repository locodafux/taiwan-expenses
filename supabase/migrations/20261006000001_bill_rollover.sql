-- Bill rollover (captain 2026-10-06: "the uncheck in checklist will go to the
-- next bill until its paid"): the sibling of 20261005000001_fund_rollover.sql.
-- When a payday is materialized, a bill row left unticked on that bill's
-- previous payday adds its amount to the same bill's new row, and the old row
-- is marked 'carried' so the money is only ever counted once. An unticked
-- bill keeps rolling on until it is ticked. No schema change: carried_amount,
-- carried_from and the 'carried' status already exist.
--
-- The "Tick off past paydays automatically" setting still wins: its sweep runs
-- before the carry lookup, so with it on a past bill counts as paid and never
-- carries. A bill past its end_date has no new row to land on, so a last
-- unpaid instalment stays where it is.

-- The bill rows a payday would take over: for each bill item, the most recent
-- earlier row, if it is still unticked and non-zero. p_adjacent (preview only)
-- additionally requires the household's latest earlier payday to be the one
-- right before p_payday_date, so a preview two paydays out doesn't repeat the
-- carry the nearer preview already shows (same rule as fund_rollover_in).
create function private.bill_rollover_in(p_household_id uuid, p_payday_date date, p_adjacent boolean)
returns table (bill_item_id uuid, amount numeric, from_payday date, source_id uuid)
language sql
stable
set search_path = ''
as $$
  with latest as (
    select max(le.payday_date) as d
    from public.ledger_entries le
    where le.household_id = p_household_id and le.payday_date < p_payday_date
  ),
  prev as (
    select distinct on (le.bill_item_id) le.bill_item_id, le.amount, le.payday_date, le.id, le.status
    from public.ledger_entries le
    where le.household_id = p_household_id and le.bill_item_id is not null
      and le.payday_date < p_payday_date
    order by le.bill_item_id, le.payday_date desc
  )
  select p.bill_item_id, p.amount, p.payday_date, p.id
  from prev p, latest
  where p.status = 'pending' and p.amount <> 0
    and (not p_adjacent or private.next_payday(p_household_id, latest.d + 1) = p_payday_date);
$$;

-- Unchanged from 20261005000001 except the bill branch picks up what the
-- bill's previous row left unticked. Idempotent the same way the fund branch
-- is: the source row is 'carried' after the first run, and the upsert keeps
-- whatever the row already carried.
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
  v_carry numeric;
  v_from date;
  v_src uuid;
begin
  if not exists (select 1 from private.user_household_ids() h where h = p_household_id) then
    raise exception 'not a member of household %', p_household_id;
  end if;

  if (select h.auto_check_past_paydays from public.households h where h.id = p_household_id) then
    update public.ledger_entries
    set status = 'checked', checked_at = now()
    where household_id = p_household_id and status = 'pending' and amount <> 0
      and bill_item_id is not null and payday_date < current_date;
  end if;

  v_payday := coalesce(p_payday_date, private.next_payday(p_household_id));

  for rec in select * from private.compute_payday_entries(p_household_id, v_payday) loop
    if rec.bill_item_id is null then
      select r.amount, r.from_payday, r.source_id into v_carry, v_from, v_src
      from private.fund_rollover_in(p_household_id, v_payday, false) r
      where r.category_id = rec.category_id;
      v_carry := coalesce(v_carry, 0);

      insert into public.ledger_entries
        (household_id, category_id, bill_item_id, payday_date, amount, status, carried_amount, carried_from)
      values (p_household_id, rec.category_id, null, v_payday, rec.amount + v_carry, 'pending', v_carry, v_from)
      on conflict (category_id, payday_date) where bill_item_id is null and not manual
      do update set
        amount = excluded.amount + public.ledger_entries.carried_amount,
        carried_amount = public.ledger_entries.carried_amount + excluded.carried_amount,
        carried_from = coalesce(excluded.carried_from, public.ledger_entries.carried_from)
        where public.ledger_entries.status = 'pending'
      returning * into v_row;
      if found then
        if v_src is not null then
          update public.ledger_entries set status = 'carried' where id = v_src;
        end if;
        return next v_row;
      end if;
    else
      select r.amount, r.from_payday, r.source_id into v_carry, v_from, v_src
      from private.bill_rollover_in(p_household_id, v_payday, false) r
      where r.bill_item_id = rec.bill_item_id;
      v_carry := coalesce(v_carry, 0);

      insert into public.ledger_entries
        (household_id, category_id, bill_item_id, payday_date, amount, status, carried_amount, carried_from)
      values (p_household_id, rec.category_id, rec.bill_item_id, v_payday, rec.amount + v_carry, 'pending', v_carry, v_from)
      on conflict (category_id, bill_item_id, payday_date) where bill_item_id is not null
      do update set
        amount = excluded.amount + public.ledger_entries.carried_amount,
        carried_amount = public.ledger_entries.carried_amount + excluded.carried_amount,
        carried_from = coalesce(excluded.carried_from, public.ledger_entries.carried_from)
        where public.ledger_entries.status = 'pending'
      returning * into v_row;
      if found then
        if v_src is not null then
          update public.ledger_entries set status = 'carried' where id = v_src;
        end if;
        return next v_row;
      end if;
    end if;
  end loop;

  return;
end;
$$;

-- Same numbers materialize_payday would write, now with bill carries too.
create or replace function public.preview_payday(p_household_id uuid, p_payday_date date)
returns table (category_id uuid, bill_item_id uuid, amount numeric, carried_amount numeric, carried_from date)
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
    select e.category_id, e.bill_item_id, e.amount + coalesce(f.amount, b.amount, 0),
           coalesce(f.amount, b.amount, 0), coalesce(f.from_payday, b.from_payday)
    from private.compute_payday_entries(p_household_id, p_payday_date) e
    left join private.fund_rollover_in(p_household_id, p_payday_date, true) f
      on e.bill_item_id is null and f.category_id = e.category_id
    left join private.bill_rollover_in(p_household_id, p_payday_date, true) b
      on e.bill_item_id is not null and b.bill_item_id = e.bill_item_id;
end;
$$;
