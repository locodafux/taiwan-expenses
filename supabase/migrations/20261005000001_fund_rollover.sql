-- Fund rollover (captain 2026-10-05: "carry over what is not checked"): when a
-- new payday is materialized, each savings-fund row left unticked on the
-- previous payday adds its amount to the same fund's row on the new one, and
-- the old row is marked 'carried' so the money is only ever counted once.
-- Bills are left as they are. (Not to be confused with public.payday_carries
-- from 20260923000020, which moves a short payday's bills onto another payday.)
--
-- Everything that sums ledger money already filters on status = 'checked', so
-- a 'carried' row drops out of balances, history and the forecast on its own;
-- the new row's amount has the carried money baked in and counts once it is
-- ticked. carried_amount/carried_from only exist so the checklist can say
-- "+₱X carried from <date>" (and so a re-run keeps the carry).
alter table public.ledger_entries
  add column carried_amount numeric(12, 2) not null default 0,
  add column carried_from date;

alter table public.ledger_entries drop constraint ledger_entries_status_check;
alter table public.ledger_entries
  add constraint ledger_entries_status_check check (status in ('pending', 'checked', 'carried'));

-- The fund rows a payday would take over: the unticked, non-zero planned
-- fund rows of the latest earlier payday that has any. p_adjacent (preview
-- only) additionally requires that payday to be the one right before
-- p_payday_date, so a preview two paydays out doesn't repeat the carry that
-- the nearer preview already shows.
create function private.fund_rollover_in(p_household_id uuid, p_payday_date date, p_adjacent boolean)
returns table (category_id uuid, amount numeric, from_payday date, source_id uuid)
language sql
stable
set search_path = ''
as $$
  with src as (
    select max(le.payday_date) as d
    from public.ledger_entries le
    where le.household_id = p_household_id and le.bill_item_id is null and not le.manual
      and le.payday_date < p_payday_date
  )
  select le.category_id, le.amount, le.payday_date, le.id
  from public.ledger_entries le, src
  where le.household_id = p_household_id and le.bill_item_id is null and not le.manual
    and le.payday_date = src.d and le.status = 'pending' and le.amount <> 0
    and (not p_adjacent or private.next_payday(p_household_id, src.d + 1) = p_payday_date);
$$;

-- Unchanged from 20260928000001 except: the auto-tick sweep covers bills only
-- (unticked funds roll forward instead), and fund rows pick up what the
-- previous payday left unticked. Idempotent: the source rows are 'carried'
-- after the first run, and the upsert keeps whatever the row already carried.
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
      insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
      values (p_household_id, rec.category_id, rec.bill_item_id, v_payday, rec.amount, 'pending')
      on conflict (category_id, bill_item_id, payday_date) where bill_item_id is not null
      do update set amount = excluded.amount
        where public.ledger_entries.status = 'pending'
      returning * into v_row;
      if found then
        return next v_row;
      end if;
    end if;
  end loop;

  return;
end;
$$;

-- Same numbers materialize_payday would write, now including the carry, plus
-- the carry itself for the checklist's note.
drop function public.preview_payday(uuid, date);
create function public.preview_payday(p_household_id uuid, p_payday_date date)
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
    select e.category_id, e.bill_item_id, e.amount + coalesce(r.amount, 0), coalesce(r.amount, 0), r.from_payday
    from private.compute_payday_entries(p_household_id, p_payday_date) e
    left join private.fund_rollover_in(p_household_id, p_payday_date, true) r
      on e.bill_item_id is null and r.category_id = e.category_id;
end;
$$;

grant execute on function public.preview_payday(uuid, date) to authenticated;
