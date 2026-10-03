-- Group child percentages and category date ranges (captain's ask: a fund
-- that has not started, or has ended, must not take up room in a month it is
-- not part of). Until now the group's <= 100% checks summed EVERY child in
-- every month, so e.g. Pinatubo Oct = 100 was refused because Taiwan Fund's
-- default counted in Oct although it starts in Dec. The payday engine
-- (excess_group_allocations) already skipped out-of-range children; only the
-- save checks forgot. Checks only - no table or data changes.

-- Sum of the effective (override-or-default) percentages of a group's
-- children in a month, leaving one out; children outside their range in that
-- month do not count. Otherwise identical to 20260930000003.
create or replace function private.group_month_total(p_parent_id uuid, p_month date, p_exclude uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(coalesce(o.percent, (c.rule ->> 'percent')::numeric)), 0)
  from public.categories c
  left join public.category_month_percents o on o.category_id = c.id and o.month = p_month
  where c.rule ->> 'type' in ('excess', 'group_child')
    and c.rule ->> 'parent_id' = p_parent_id::text
    and c.id <> p_exclude
    and private.category_in_range(c.start_month, c.end_month, p_month);
$$;

-- Same, but defaults only (no month overrides).
create function private.group_default_total(p_parent_id uuid, p_month date, p_exclude uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum((c.rule ->> 'percent')::numeric), 0)
  from public.categories c
  where c.rule ->> 'type' in ('excess', 'group_child')
    and c.rule ->> 'parent_id' = p_parent_id::text
    and c.id <> p_exclude
    and private.category_in_range(c.start_month, c.end_month, p_month);
$$;

-- An override for a month the fund is not part of cannot change any total, so
-- it is not checked (and dropping one has nothing to re-check). Otherwise
-- identical to 20260930000003.
create or replace function private.validate_month_percent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cat public.categories;
  v_total numeric;
begin
  if tg_op = 'DELETE' then
    -- Nested (a category unlinked/deleted, or a household cascade): nothing to
    -- re-check, the parent trigger owns that path.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    select * into v_cat from public.categories where id = old.category_id;
    if not found or v_cat.rule ->> 'type' not in ('excess', 'group_child') then
      return old;
    end if;
    if not private.category_in_range(v_cat.start_month, v_cat.end_month, old.month) then
      return old;
    end if;
    -- Dropping an override puts the default back, which must still fit.
    v_total := private.group_month_total((v_cat.rule ->> 'parent_id')::uuid, old.month, v_cat.id)
      + (v_cat.rule ->> 'percent')::numeric;
    if v_total > 100 then
      raise exception 'group child percentages would exceed 100 in % (got %)',
        to_char(old.month, 'Mon YYYY'), v_total;
    end if;
    return old;
  end if;

  select * into v_cat from public.categories where id = new.category_id;
  if not found or v_cat.rule ->> 'type' not in ('excess', 'group_child') then
    raise exception 'a monthly percentage only applies to a category inside a group';
  end if;
  if not private.category_in_range(v_cat.start_month, v_cat.end_month, new.month) then
    return new;
  end if;
  v_total := private.group_month_total((v_cat.rule ->> 'parent_id')::uuid, new.month, v_cat.id) + new.percent;
  if v_total > 100 then
    raise exception 'group child percentages cannot exceed 100 in % (got %)',
      to_char(new.month, 'Mon YYYY'), v_total;
  end if;
  return new;
end;
$$;

-- Range-aware default and override-month checks (and re-run when a child's
-- range changes). Otherwise identical to 20260930000003.
create or replace function private.validate_excess_group_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.categories;
  v_percent numeric;
  v_child_total numeric;
  v_parent_id uuid;
  v_goal jsonb;
  v_target numeric;
  v_target_date date;
  v_is_child boolean;
  v_month date;
  v_month_total numeric;
  v_old_parent text;
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.categories c
      where c.rule ->> 'type' in ('excess', 'group_child')
        and c.rule ->> 'parent_id' = old.id::text
    ) then
      raise exception 'cannot delete group parent % while it has linked categories', old.name;
    end if;
    return old;
  end if;

  v_is_child := new.rule ->> 'type' in ('excess', 'group_child');
  if tg_op = 'UPDATE' and old.rule ->> 'type' in ('excess', 'group_child') then
    v_old_parent := old.rule ->> 'parent_id';
  end if;

  -- A group child is an allocation rule, so it remains fund-only. The parent
  -- relationship itself is structural and may point at a bill category.
  if v_is_child then
    if new.kind <> 'fund' then
      raise exception 'only fund categories can link to a group parent';
    end if;
    if new.is_group_parent then
      raise exception 'a group child cannot also be a group parent';
    end if;
    if new.rule ->> 'parent_id' is null then
      raise exception 'a group child needs a parent_id';
    end if;

    begin
      v_parent_id := (new.rule ->> 'parent_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'group parent_id must be a valid category id';
    end;

    select c.* into v_parent
    from public.categories c
    where c.id = v_parent_id;
    if not found then
      raise exception 'group parent % does not exist', new.rule ->> 'parent_id';
    end if;
    if v_parent.household_id <> new.household_id then
      raise exception 'group parent must belong to the same household';
    end if;
    if v_parent.id = new.id then
      raise exception 'a group child cannot link to itself';
    end if;
    if not v_parent.is_group_parent and v_parent.rule ->> 'excess_source' <> 'true' then
      raise exception 'group parent must be marked as a group parent';
    end if;
    if v_parent.rule ->> 'type' in ('excess', 'group_child') then
      raise exception 'multi-level category groups are not supported';
    end if;

    begin
      v_percent := (new.rule ->> 'percent')::numeric;
    exception when invalid_text_representation then
      raise exception 'group percentage must be a number between 0 and 100';
    end;
    if v_percent is null or v_percent <> v_percent or v_percent < 0 or v_percent > 100 then
      raise exception 'group percentage must be between 0 and 100';
    end if;

    v_goal := new.rule -> 'goal';
    if v_goal is not null then
      if jsonb_typeof(v_goal) <> 'object' then
        raise exception 'group child goal must be an object';
      end if;
      if v_goal ->> 'target_amount' is null then
        raise exception 'group child goal needs a target_amount';
      end if;
      begin
        v_target := (v_goal ->> 'target_amount')::numeric;
      exception when invalid_text_representation then
        raise exception 'group child goal target_amount must be a positive number';
      end;
      if v_target is null or v_target <> v_target or v_target <= 0 then
        raise exception 'group child goal target_amount must be a positive number';
      end if;
      if v_goal ? 'target_date' and v_goal ->> 'target_date' is not null then
        begin
          v_target_date := (v_goal ->> 'target_date')::date;
        exception when others then
          raise exception 'group child goal target_date must be a valid date';
        end;
        if v_target_date is null then
          raise exception 'group child goal target_date must be a valid date';
        end if;
      end if;
      if v_goal ? 'one_time' and jsonb_typeof(v_goal -> 'one_time') <> 'boolean' then
        raise exception 'group child goal one_time must be a boolean';
      end if;
    end if;
  else
    v_parent_id := new.id;
  end if;

  select coalesce(sum((c.rule ->> 'percent')::numeric), 0)
    into v_child_total
  from public.categories c
  where c.household_id = new.household_id
    and c.rule ->> 'type' in ('excess', 'group_child')
    and c.rule ->> 'parent_id' = v_parent_id::text;

  -- A BEFORE trigger cannot see the row currently being inserted/updated.
  if v_is_child then
    if tg_op = 'UPDATE'
      and old.rule ->> 'type' in ('excess', 'group_child')
      and old.rule ->> 'parent_id' = v_parent_id::text then
      v_child_total := v_child_total - (old.rule ->> 'percent')::numeric;
    end if;
    v_child_total := v_child_total + v_percent;
  end if;

  if not new.is_group_parent and new.rule ->> 'excess_source' <> 'true' and v_child_total > 0 then
    raise exception 'cannot remove group parent while it has linked categories';
  end if;
  -- The default shares must fit in every month a sibling starts (the only
  -- months where the total can rise), counting only children in range there.
  for v_month in
    select c.start_month
    from public.categories c
    where c.rule ->> 'type' in ('excess', 'group_child')
      and c.rule ->> 'parent_id' = v_parent_id::text
      and c.id <> new.id
    union
    select new.start_month where v_is_child
  loop
    v_month_total := private.group_default_total(v_parent_id, v_month, new.id)
      + case when v_is_child and private.category_in_range(new.start_month, new.end_month, v_month)
          then v_percent else 0 end;
    if v_month_total > 100 then
      raise exception 'group child percentages cannot exceed 100 (got %)', v_month_total;
    end if;
  end loop;

  if v_is_child then
    -- A child that stops being one (or moves parent) drops its month overrides.
    -- Nested, so the override table's own delete check is skipped.
    if v_old_parent is not null and v_old_parent <> v_parent_id::text then
      delete from public.category_month_percents where category_id = new.id;
    end if;
    -- The same <= 100 rule for every month that has an override in this group.
    for v_month in
      select o.month
      from public.category_month_percents o
      join public.categories c on c.id = o.category_id
      where c.rule ->> 'parent_id' = v_parent_id::text and c.id <> new.id
      union
      select o.month from public.category_month_percents o
      where o.category_id = new.id and v_old_parent is not distinct from v_parent_id::text
    loop
      v_month_total := private.group_month_total(v_parent_id, v_month, new.id)
        + case when private.category_in_range(new.start_month, new.end_month, v_month)
            then coalesce((select o.percent from public.category_month_percents o
                           where o.category_id = new.id and o.month = v_month), v_percent)
            else 0 end;
      if v_month_total > 100 then
        raise exception 'group child percentages cannot exceed 100 in % (got %)',
          to_char(v_month, 'Mon YYYY'), v_month_total;
      end if;
    end loop;
  elsif v_old_parent is not null then
    delete from public.category_month_percents where category_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger categories_validate_excess_group on public.categories;
create trigger categories_validate_excess_group
  before insert or update of household_id, kind, rule, is_group_parent, start_month, end_month or delete on public.categories
  for each row execute function private.validate_excess_group_category();
