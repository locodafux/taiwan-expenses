-- Carry-over for rows the payday engine did not plan (captain 2026-10-07: "i
-- want to in checklist a unpaid bills and funds"). The fund (20261005000001)
-- and bill (20261006000001) rollovers only add the unticked amount to a row
-- that materialize_payday was already writing for that fund or bill, so
-- money left unticked never showed up when the next payday had no row for it:
-- a fund the engine skips that payday (e.g. a group child whose parent has
-- nothing to split, or one past its end month), or a bill that is not due
-- until a later payday. It sat unticked on the old payday and never moved.
--
-- Now such an amount lands on the next payday as a carry-only row: a pending
-- row whose amount is exactly what was carried (carried_amount = amount,
-- carried_from = the old payday), with the old row marked 'carried'. It is an
-- ordinary row from then on: tickable (that is what moves the money into the
-- balance and the archive, once), and if left unticked it carries on to the
-- following payday, and so on until paid. A row set to ₱0 counts as dropped.
-- Every consumer already treats carried_amount rows this way, so the
-- checklist, totals and archive need no change (the dashboard's per-payday
-- amount nets carried_amount, so a carry-only row adds nothing there).

-- Same as 20261006000001 plus: with "Tick off past paydays automatically" on,
-- a bill from a past payday counts as paid and never carries, even when a
-- caller (the backfill below, a preview) has not run materialize_payday's
-- sweep yet.
create or replace function private.bill_rollover_in(p_household_id uuid, p_payday_date date, p_adjacent boolean)
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
    and not (p.payday_date < current_date
      and (select h.auto_check_past_paydays from public.households h where h.id = p_household_id))
    and (not p_adjacent or private.next_payday(p_household_id, latest.d + 1) = p_payday_date);
$$;

-- Creates the carry-only rows for p_payday_date: every fund or bill that has
-- a rollover source (same lookup the normal carry uses) but no row on that
-- payday. Returns the rows it created. Idempotent: the source is claimed
-- ('pending' -> 'carried') before its row is written, so a second call, or a
-- concurrent one, finds nothing left to carry and never doubles the money.
-- materialize_payday calls it after its normal rows; it is also the primitive
-- for attaching carries to a payday that was materialized before this existed.
create function private.carry_unmatched_rollovers(p_household_id uuid, p_payday_date date)
returns setof public.ledger_entries
language plpgsql
set search_path = ''
as $$
declare
  rec record;
  v_row public.ledger_entries;
begin
  for rec in
    select r.category_id, null::uuid as bill_item_id, r.amount, r.from_payday, r.source_id
    from private.fund_rollover_in(p_household_id, p_payday_date, false) r
    where not exists (
      select 1 from public.ledger_entries le
      where le.household_id = p_household_id and le.category_id = r.category_id
        and le.payday_date = p_payday_date and le.bill_item_id is null and not le.manual
    )
    union all
    select bi.category_id, r.bill_item_id, r.amount, r.from_payday, r.source_id
    from private.bill_rollover_in(p_household_id, p_payday_date, false) r
    join public.bill_items bi on bi.id = r.bill_item_id
    where not exists (
      select 1 from public.ledger_entries le
      where le.bill_item_id = r.bill_item_id and le.payday_date = p_payday_date
    )
  loop
    update public.ledger_entries set status = 'carried'
    where id = rec.source_id and status = 'pending';
    if found then
      insert into public.ledger_entries
        (household_id, category_id, bill_item_id, payday_date, amount, status, carried_amount, carried_from)
      values (p_household_id, rec.category_id, rec.bill_item_id, p_payday_date, rec.amount, 'pending', rec.amount, rec.from_payday)
      returning * into v_row;
      return next v_row;
    end if;
  end loop;
end;
$$;

-- Unchanged from 20261006000001 except the last step: carry-only rows for
-- whatever the normal rows above did not pick up.
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

  return query select * from private.carry_unmatched_rollovers(p_household_id, v_payday);
end;
$$;

-- Same numbers materialize_payday would write, now including the carry-only
-- rows (what the old payday left unticked for a fund or bill with no row of
-- its own that payday). Otherwise unchanged from 20261006000001.
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
    with planned as (
      select * from private.compute_payday_entries(p_household_id, p_payday_date)
    )
    select e.category_id, e.bill_item_id, e.amount + coalesce(f.amount, b.amount, 0),
           coalesce(f.amount, b.amount, 0), coalesce(f.from_payday, b.from_payday)
    from planned e
    left join private.fund_rollover_in(p_household_id, p_payday_date, true) f
      on e.bill_item_id is null and f.category_id = e.category_id
    left join private.bill_rollover_in(p_household_id, p_payday_date, true) b
      on e.bill_item_id is not null and b.bill_item_id = e.bill_item_id
    union all
    select f.category_id, null::uuid, f.amount, f.amount, f.from_payday
    from private.fund_rollover_in(p_household_id, p_payday_date, true) f
    where not exists (select 1 from planned e where e.bill_item_id is null and e.category_id = f.category_id)
    union all
    select bi.category_id, b.bill_item_id, b.amount, b.amount, b.from_payday
    from private.bill_rollover_in(p_household_id, p_payday_date, true) b
    join public.bill_items bi on bi.id = b.bill_item_id
    where not exists (select 1 from planned e where e.bill_item_id = b.bill_item_id);
end;
$$;

-- Backfill: attaches the carry-only rows to paydays that were materialized
-- before this migration (e.g. the household's next payday, which already has
-- its rows but none for a fund the engine skipped). Walks every household's
-- already-materialized paydays from p_from on, oldest first, and returns how
-- many rows it created. Idempotent and safe to run again: it only writes a
-- row for a source that is still unticked and has no row on that payday, and
-- it leaves every existing row alone.
create function private.backfill_carry_unmatched_rollovers(p_from date default current_date)
returns int
language plpgsql
set search_path = ''
as $$
declare
  rec record;
  v_total int := 0;
  v_n int;
begin
  for rec in
    select distinct le.household_id, le.payday_date
    from public.ledger_entries le
    where le.payday_date >= p_from
    order by le.payday_date, le.household_id
  loop
    select count(*) into v_n from private.carry_unmatched_rollovers(rec.household_id, rec.payday_date);
    v_total := v_total + v_n;
  end loop;
  return v_total;
end;
$$;

select private.backfill_carry_unmatched_rollovers();
