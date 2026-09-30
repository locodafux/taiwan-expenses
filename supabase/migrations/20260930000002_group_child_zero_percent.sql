-- A group child may now have 0%: it gets nothing that month, which is a valid
-- state (it keeps the group sum rule intact and simply leaves its would-be
-- share in the parent). Only change vs 20260926000002: the percentage check
-- allows 0 (was > 0). Everything else in the trigger function is unchanged.

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
  if v_child_total > 100 then
    raise exception 'group child percentages cannot exceed 100 (got %)', v_child_total;
  end if;

  return new;
end;
$$;
