-- Excess groups: a fund can be marked as a source whose payday allocation is
-- shared with linked child funds. A child uses the `excess` rule instead of
-- taking part in the normal goal/capped/remainder tiers. This keeps the
-- existing rule JSON schema while making the relationship explicit:
--
--   source: {"type":"remainder","percent":20,"excess_source":true}
--   child:  {"type":"excess","parent_id":"...","percent":40}
--
-- The percentages are validated as a group and must total at most 100. Any
-- unclaimed amount remains in the source. This is deliberately a rejection,
-- rather than a cap, so a typo cannot silently change a household's intended
-- distribution.

alter table public.categories drop constraint categories_rule_check;
alter table public.categories
  add constraint categories_rule_check
  check (rule is null or rule ->> 'type' in ('goal', 'capped_percent', 'remainder', 'excess'));

create function private.validate_excess_group_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.categories;
  v_percent numeric;
  v_child_total numeric;
  v_group_id uuid;
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.categories c
      where c.rule ->> 'type' = 'excess'
        and c.rule ->> 'parent_id' = old.id::text
    ) then
      raise exception 'cannot delete excess group % while it has linked categories', old.name;
    end if;
    return old;
  end if;

  if new.rule ->> 'excess_source' = 'true' and new.kind <> 'fund' then
    raise exception 'only fund categories can be excess group sources';
  end if;

  if new.rule ->> 'type' = 'excess' then
    if new.kind <> 'fund' then
      raise exception 'only fund categories can link to an excess group';
    end if;
    if new.rule ->> 'excess_source' = 'true' then
      raise exception 'an excess group child cannot also be a group source';
    end if;
    if new.rule ->> 'parent_id' is null then
      raise exception 'an excess group child needs a parent_id';
    end if;

    select c.* into v_parent
    from public.categories c
    where c.id = (new.rule ->> 'parent_id')::uuid;
    if not found then
      raise exception 'excess group parent % does not exist', new.rule ->> 'parent_id';
    end if;
    if v_parent.household_id <> new.household_id then
      raise exception 'excess group parent must belong to the same household';
    end if;
    if v_parent.id = new.id then
      raise exception 'an excess group category cannot link to itself';
    end if;
    if v_parent.kind <> 'fund' or v_parent.rule ->> 'excess_source' <> 'true' then
      raise exception 'excess group parent must be a marked fund source';
    end if;
    if v_parent.rule ->> 'type' = 'excess' then
      raise exception 'multi-level excess groups are not supported';
    end if;

    v_percent := (new.rule ->> 'percent')::numeric;
    if v_percent is null or v_percent <> v_percent or v_percent <= 0 or v_percent > 100 then
      raise exception 'excess group percentage must be between 0 and 100';
    end if;
    v_group_id := v_parent.id;
  else
    v_group_id := new.id;
  end if;

  select coalesce(sum((c.rule ->> 'percent')::numeric), 0)
    into v_child_total
  from public.categories c
  where c.household_id = new.household_id
    and c.rule ->> 'type' = 'excess'
    and c.rule ->> 'parent_id' = v_group_id::text;

  -- A BEFORE trigger cannot see the row currently being inserted/updated.
  -- Include its percentage when it is the child being validated.
  if new.rule ->> 'type' = 'excess' then
    if tg_op = 'UPDATE'
      and old.rule ->> 'type' = 'excess'
      and old.rule ->> 'parent_id' = v_group_id::text then
      v_child_total := v_child_total - (old.rule ->> 'percent')::numeric;
    end if;
    v_child_total := v_child_total + v_percent;
  end if;

  if new.rule ->> 'excess_source' <> 'true' and v_child_total > 0 then
    raise exception 'cannot remove excess group source while it has linked categories';
  end if;
  if v_child_total > 100 then
    raise exception 'excess group child percentages cannot exceed 100 (got %)', v_child_total;
  end if;

  return new;
end;
$$;

create trigger categories_validate_excess_group
  before insert or update of household_id, kind, rule or delete on public.categories
  for each row execute function private.validate_excess_group_category();

-- Split a source's one-payday amount using the linked percentages. The helper
-- allocates the claimed pool as a whole, so rounding never creates more money
-- than the source amount. The source keeps amount - sum(children).
create function private.excess_group_allocations(p_parent_id uuid, p_amount numeric)
returns table (category_id uuid, amount numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_percentages numeric[];
  v_total numeric;
  v_amounts numeric[];
  i int;
begin
  if p_amount <= 0 then
    return;
  end if;

  select
    coalesce(array_agg(c.id order by c.sort_order, c.id), ARRAY[]::uuid[]),
    coalesce(array_agg((c.rule ->> 'percent')::numeric order by c.sort_order, c.id), ARRAY[]::numeric[]),
    coalesce(sum((c.rule ->> 'percent')::numeric), 0)
  into v_ids, v_percentages, v_total
  from public.categories c
  where c.kind = 'fund'
    and c.rule ->> 'type' = 'excess'
    and c.rule ->> 'parent_id' = p_parent_id::text;

  if cardinality(v_ids) = 0 then
    return;
  end if;

  v_amounts := private.allocate_proportional(p_amount * v_total / 100, v_percentages);
  for i in 1 .. cardinality(v_ids) loop
    category_id := v_ids[i];
    amount := v_amounts[i];
    return next;
  end loop;
end;
$$;

-- The latest materialize_payday version, extended with the source/child fanout.
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
  v_source_amount numeric;
  v_child_total numeric;
  v_parent_checked boolean;
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
    v_source_amount := v_amounts[i];
    select coalesce(sum(e.amount), 0)
      into v_child_total
    from private.excess_group_allocations(v_cats[i], v_source_amount) e;

    select exists (
      select 1 from public.ledger_entries le
      where le.category_id = v_cats[i] and le.payday_date = v_payday
        and le.bill_item_id is null and not le.manual and le.status = 'checked'
    ) into v_parent_checked;

    insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
    values (p_household_id, v_cats[i], null, v_payday, v_source_amount - v_child_total, 'pending')
    on conflict (category_id, payday_date) where bill_item_id is null and not manual
    do update set amount = excluded.amount
      where public.ledger_entries.status <> 'checked'
    returning * into v_row;
    if found then
      return next v_row;
    end if;

    -- Checked rows are immutable history. New/pending parent rows fan out to
    -- children; a checked parent is left alone together with its children.
    if not v_parent_checked then
      for rec in select e.category_id, e.amount from private.excess_group_allocations(v_cats[i], v_source_amount) e
      loop
        insert into public.ledger_entries (household_id, category_id, bill_item_id, payday_date, amount, status)
        values (p_household_id, rec.category_id, null, v_payday, rec.amount, 'pending')
        on conflict (category_id, payday_date) where bill_item_id is null and not manual
        do update set amount = excluded.amount
          where public.ledger_entries.status <> 'checked'
        returning * into v_row;
        if found then
          return next v_row;
        end if;
      end loop;
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
