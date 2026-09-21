-- Extra savings deposits (captain's intent, 2026-09-20: "add to savings a
-- button to add what is left or what is amount").
--
-- A deposit the household makes on top of the plan - the payday's left-over
-- money, or any typed amount - is a fund ledger row with no bill item, the
-- same shape as a planned fund contribution. Until now the only thing telling
-- them apart was nothing, so ledger_entries_fund_occurrence's one-row-per-
-- (category, payday) rule made a deposit collide with the planned row on the
-- same date, and a second deposit into the same fund on the same day collide
-- with the first. `manual` marks the deposit rows and takes them out of that
-- rule; materialize_payday never writes or touches them.
alter table public.ledger_entries add column manual boolean not null default false;

drop index public.ledger_entries_fund_occurrence;
create unique index ledger_entries_fund_occurrence
  on public.ledger_entries (category_id, payday_date)
  where bill_item_id is null and not manual;

-- Unchanged from 20260920000003 except the fund upsert's conflict target, which
-- must repeat the index's new predicate for Postgres to infer it.
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
