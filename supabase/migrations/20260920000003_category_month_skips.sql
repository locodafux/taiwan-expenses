-- Per-month "skip this fund" (captain's intent, 2026-09-20: savings /
-- emergency / excess should be optional based on the month).
--
-- Why its own table rather than a flag on ledger_entries: the skip is a fact
-- about a (category, month) pair, but a ledger_entries row is per (category,
-- payday) and only the imminent payday is ever materialized - a month with two
-- paydays has no row to flag for the second one yet. It also has to outlive
-- re-materialization, which rewrites ledger rows. So the table is the source of
-- truth and materialize_payday mirrors it onto each payday's row as
-- status = 'skipped', amount 0.
--
-- Deliberately NOT wired into the allocation engine: skipping a fund means the
-- checklist stops asking for that money this month, it does not redistribute
-- it into the other funds (that would raise the other asks, the opposite of
-- "optional"). Un-skipping therefore restores the originally planned amount.
create table public.category_month_skips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  -- always the first of the month; the check keeps a client from storing a
  -- mid-month date that would never match materialize_payday's date_trunc.
  month date not null check (month = date_trunc('month', month)::date),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (category_id, month)
);

create index category_month_skips_household_idx
  on public.category_month_skips (household_id, month);

-- Same denormalize-from-parent trigger every other scoped table uses, so the
-- flat RLS predicate below can never disagree with the category's household.
create trigger category_month_skips_set_household_id
  before insert or update of category_id on public.category_month_skips
  for each row execute function public.set_household_id_from_category();

alter table public.category_month_skips enable row level security;

-- materialize_payday is SECURITY INVOKER, so the caller needs the select
-- policy to see their own household's skips from inside it.
create policy "members read category_month_skips" on public.category_month_skips
  for select to authenticated
  using (household_id in (select private.user_household_ids()));

create policy "members write category_month_skips" on public.category_month_skips
  for insert to authenticated
  with check (household_id in (select private.user_household_ids()));

-- Un-skip is a delete. No update policy: a skip has nothing to edit.
create policy "members delete category_month_skips" on public.category_month_skips
  for delete to authenticated
  using (household_id in (select private.user_household_ids()));

-- Deliberately NOT added to the supabase_realtime publication: no client ever
-- reads this table. A partner's skip reaches the other device through the
-- ledger_entries rows materialize_payday rewrites, which is already published.

-- 'skipped' joins the ledger status enum. It is only ever written by
-- materialize_payday from the table above, never by a client.
alter table public.ledger_entries drop constraint ledger_entries_status_check;
alter table public.ledger_entries add constraint ledger_entries_status_check
  check (status in ('pending', 'checked', 'skipped'));

-- Re-materialization previously rewrote EVERY matching row's amount, including
-- one already ticked off - silently rewriting the history of what was actually
-- paid. Both loops below now leave a 'checked' row alone, and the fund loop
-- mirrors category_month_skips onto the row it writes.
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
  v_amounts numeric[];
  rec record;
  v_row public.ledger_entries;
  v_skipped boolean;
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
    v_skipped := exists (
      select 1 from public.category_month_skips s
      where s.category_id = rec.category_id and s.month = v_month
    );
    insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
    values (
      p_household_id, rec.category_id, null, v_payday,
      case when v_skipped then 0 else v_amounts[v_idx] end,
      case when v_skipped then 'skipped' else 'pending' end
    )
    on conflict (category_id, payday_date) where bill_item_id is null
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
