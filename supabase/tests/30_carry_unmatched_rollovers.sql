-- Verifies 20261008000001_carry_unmatched_rollovers.sql: an unticked fund or
-- bill that has no row of its own on the next payday still lands there as a
-- carry-only row (amount = carried_amount, carried_from = the old payday) and
-- the old row is marked 'carried'. Covered: the Pinatubo case (a group child
-- whose parent has nothing to split that payday), a bill not due that payday,
-- re-runs never doubling the money, the carry rolling on payday after payday
-- until ticked, ticking it counting the money once, preview_payday showing
-- the row without writing, the backfill attaching it to a payday materialized
-- earlier (and leaving auto-ticked bills alone), and the carried-bill tick
-- guard still holding. Paydays are in 2020 so the test holds whatever today's
-- date is.

do $$
declare
  v_a uuid := gen_random_uuid();
  v_household uuid;
  v_member uuid;
  v_bill_cat uuid;
  v_parent uuid;
  v_pinatubo uuid;
  v_rent uuid;
  v_row public.ledger_entries;
  v_n int;
  v_before int;
  v_refused boolean;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
    'carry-unmatched-a@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Ana'),
    now(), now(), '', '', '', ''
  );
  select household_id, id into v_household, v_member from public.household_members where user_id = v_a;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_a::text, false);

  -- Pay on the 5th (₱10,000), 15th and 25th (₱1,000 each, fully spent on a
  -- bill that day), so on the 15th and 25th the fund pool has nothing to
  -- split and its group child gets no row, like Pinatubo under Excess.
  insert into public.incomes (member_id, label, amount, recurring_day) values
    (v_member, 'Salary', 10000, 5), (v_member, 'Side', 1000, 15), (v_member, 'Side 2', 1000, 25);
  insert into public.categories (household_id, kind, name, sort_order, start_month)
  values (v_household, 'bill', 'Bills', 0, '2020-01-01') returning id into v_bill_cat;
  insert into public.bill_items (category_id, label, amount, recurring_day)
  values (v_bill_cat, 'Insurance', 1000, 15), (v_bill_cat, 'Phone', 1000, 25);
  insert into public.bill_items (category_id, label, amount, recurring_day)
  values (v_bill_cat, 'Rent', 2000, 5) returning id into v_rent;
  insert into public.categories (household_id, kind, name, sort_order, rule, is_group_parent, start_month)
  values (v_household, 'fund', 'Pool', 1, '{"type":"remainder","percent":100}'::jsonb, true, '2020-01-01')
  returning id into v_parent;
  insert into public.categories (household_id, kind, name, sort_order, rule, start_month)
  values (v_household, 'fund', 'Pinatubo', 2,
    jsonb_build_object('type', 'group_child', 'parent_id', v_parent, 'percent', 40), '2020-01-01')
  returning id into v_pinatubo;

  -- --- Jan 5: Pinatubo ₱3,200 and Rent ₱2,000, left unticked -----------------
  perform public.materialize_payday(v_household, '2020-01-05');
  select * into v_row from public.ledger_entries where category_id = v_pinatubo and payday_date = '2020-01-05';
  if v_row.amount <> 3200 or v_row.status <> 'pending' then
    raise exception 'FAIL: setup - Jan 5 Pinatubo should be 3200 pending, got %', to_json(v_row);
  end if;

  -- --- Jan 15: neither has a planned row; both land as carry-only rows -------
  perform public.materialize_payday(v_household, '2020-01-15');
  if exists (select 1 from public.ledger_entries where category_id = v_pinatubo and payday_date = '2020-01-15'
             and (amount, carried_amount, carried_from, status, bill_item_id, manual)
                 is distinct from (3200::numeric, 3200::numeric, '2020-01-05'::date, 'pending', null::uuid, false))
     or (select count(*) from public.ledger_entries where category_id = v_pinatubo and payday_date = '2020-01-15') <> 1 then
    raise exception 'FAIL: Jan 15 should hold one carry-only Pinatubo row of 3200 from Jan 5, got %',
      (select json_agg(l) from public.ledger_entries l where category_id = v_pinatubo and payday_date = '2020-01-15');
  end if;
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-01-15';
  if v_row.amount <> 2000 or v_row.carried_amount <> 2000 or v_row.carried_from <> '2020-01-05'
     or v_row.status <> 'pending' or v_row.category_id <> v_bill_cat then
    raise exception 'FAIL: Jan 15 should hold a carry-only Rent row of 2000 from Jan 5, got %', to_json(v_row);
  end if;
  if (select count(*) from public.ledger_entries where payday_date = '2020-01-05' and status = 'carried'
        and (category_id = v_pinatubo or bill_item_id = v_rent)) <> 2 then
    raise exception 'FAIL: the Jan 5 Pinatubo and Rent rows should both be marked carried';
  end if;

  -- --- Re-running never doubles the money ------------------------------------
  select count(*) into v_before from public.ledger_entries where household_id = v_household;
  perform public.materialize_payday(v_household, '2020-01-15');
  perform public.materialize_payday(v_household, '2020-01-15');
  if (select count(*) from public.ledger_entries where household_id = v_household) <> v_before
     or (select amount from public.ledger_entries where category_id = v_pinatubo and payday_date = '2020-01-15') <> 3200
     or (select amount from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-01-15') <> 2000 then
    raise exception 'FAIL: re-materializing Jan 15 changed the carry-only rows';
  end if;
  -- The carry never counts as paid: nothing is checked yet.
  if exists (select 1 from public.ledger_entries where household_id = v_household and status = 'checked') then
    raise exception 'FAIL: nothing has been ticked, nothing should be checked';
  end if;

  -- --- Preview of Jan 25 shows the same rows, writing nothing ----------------
  select count(*) into v_before from public.ledger_entries where household_id = v_household;
  select p.amount, p.carried_amount, p.carried_from into v_row.amount, v_row.carried_amount, v_row.carried_from
  from public.preview_payday(v_household, '2020-01-25') p where p.category_id = v_pinatubo and p.bill_item_id is null;
  if v_row.amount <> 3200 or v_row.carried_amount <> 3200 or v_row.carried_from <> '2020-01-15' then
    raise exception 'FAIL: the Jan 25 preview should show Pinatubo 3200 carried from Jan 15, got %', to_json(v_row);
  end if;
  select p.amount, p.carried_amount, p.carried_from into v_row.amount, v_row.carried_amount, v_row.carried_from
  from public.preview_payday(v_household, '2020-01-25') p where p.bill_item_id = v_rent;
  if v_row.amount <> 2000 or v_row.carried_amount <> 2000 or v_row.carried_from <> '2020-01-15' then
    raise exception 'FAIL: the Jan 25 preview should show Rent 2000 carried from Jan 15, got %', to_json(v_row);
  end if;
  if (select count(*) from public.ledger_entries where household_id = v_household) <> v_before
     or (select status from public.ledger_entries where category_id = v_pinatubo and payday_date = '2020-01-15') <> 'pending' then
    raise exception 'FAIL: preview must not write or mark anything';
  end if;
  -- A payday two ahead must not repeat the carry the nearer preview shows.
  select count(*) into v_n from public.preview_payday(v_household, '2020-02-25') p
  where (p.category_id = v_pinatubo and p.bill_item_id is null or p.bill_item_id = v_rent) and p.carried_amount <> 0;
  if v_n <> 0 then
    raise exception 'FAIL: a payday two ahead must not repeat the carry';
  end if;

  -- --- Jan 25: still unticked, it rolls on again ----------------------------
  perform public.materialize_payday(v_household, '2020-01-25');
  select * into v_row from public.ledger_entries where category_id = v_pinatubo and payday_date = '2020-01-25';
  if v_row.amount <> 3200 or v_row.carried_amount <> 3200 or v_row.carried_from <> '2020-01-15' or v_row.status <> 'pending' then
    raise exception 'FAIL: Jan 25 should roll Pinatubo on from Jan 15, got %', to_json(v_row);
  end if;
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-01-25';
  if v_row.amount <> 2000 or v_row.carried_from <> '2020-01-15' then
    raise exception 'FAIL: Jan 25 should roll Rent on from Jan 15, got %', to_json(v_row);
  end if;
  if (select count(*) from public.ledger_entries where payday_date = '2020-01-15' and status = 'carried'
        and (category_id = v_pinatubo or bill_item_id = v_rent)) <> 2 then
    raise exception 'FAIL: the Jan 15 carry-only rows should now be marked carried';
  end if;

  -- --- Backfill: a payday materialized before the migration -----------------
  -- Simulate Jan 25 having been written without the carry-only rows.
  reset role;
  delete from public.ledger_entries
  where payday_date = '2020-01-25' and carried_from = '2020-01-15'
    and (category_id = v_pinatubo or bill_item_id = v_rent);
  update public.ledger_entries set status = 'pending'
  where payday_date = '2020-01-15' and (category_id = v_pinatubo or bill_item_id = v_rent);
  -- With auto-tick on, a past bill counts as paid and is left alone; the fund is attached.
  update public.households set auto_check_past_paydays = true where id = v_household;
  perform private.backfill_carry_unmatched_rollovers('2020-01-25');
  if not exists (select 1 from public.ledger_entries where category_id = v_pinatubo and payday_date = '2020-01-25'
                 and amount = 3200 and carried_amount = 3200 and carried_from = '2020-01-15' and status = 'pending')
     or exists (select 1 from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-01-25') then
    raise exception 'FAIL: backfill with auto-tick on should attach Pinatubo but not Rent';
  end if;
  update public.households set auto_check_past_paydays = false where id = v_household;
  perform private.backfill_carry_unmatched_rollovers('2020-01-25');
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-01-25';
  if v_row.amount <> 2000 or v_row.carried_amount <> 2000 or v_row.carried_from <> '2020-01-15' then
    raise exception 'FAIL: backfill should attach Rent once auto-tick is off, got %', to_json(v_row);
  end if;
  -- Running it again changes nothing; a start date after the payday skips it.
  select count(*) into v_before from public.ledger_entries where household_id = v_household;
  perform private.backfill_carry_unmatched_rollovers('2020-01-25');
  perform private.backfill_carry_unmatched_rollovers('2020-02-01');
  if (select count(*) from public.ledger_entries where household_id = v_household) <> v_before
     or (select amount from public.ledger_entries where category_id = v_pinatubo and payday_date = '2020-01-25') <> 3200
     or (select amount from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-01-25') <> 2000 then
    raise exception 'FAIL: backfill is not idempotent';
  end if;
  set role authenticated;

  -- --- A carried bill row can't be ticked (the #130 guard); the live one can -
  v_refused := false;
  begin
    update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now()
    where bill_item_id = v_rent and payday_date = '2020-01-15';
  exception when others then
    v_refused := sqlerrm like '%carried to its next payday%';
  end;
  if not v_refused then
    raise exception 'FAIL: ticking the carried Jan 15 Rent row should be refused';
  end if;

  -- --- Ticking the carry-only fund row settles the money exactly once -------
  update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now()
  where category_id = v_pinatubo and payday_date = '2020-01-25' and bill_item_id is null;
  if (select sum(amount) from public.ledger_entries where category_id = v_pinatubo and status = 'checked') <> 3200
     or (select count(*) from public.ledger_entries where category_id = v_pinatubo and status = 'checked') <> 1
     or exists (select 1 from public.ledger_entries where category_id = v_pinatubo and status = 'checked'
                and payday_date <> '2020-01-25') then
    raise exception 'FAIL: only the Jan 25 Pinatubo row should be checked, holding 3200 once';
  end if;
  -- Nothing rolls on from a ticked row; Rent (unticked) keeps rolling to its own day.
  perform public.materialize_payday(v_household, '2020-02-05');
  select * into v_row from public.ledger_entries where category_id = v_pinatubo and payday_date = '2020-02-05' and bill_item_id is null;
  if v_row.carried_amount <> 0 or v_row.carried_from is not null then
    raise exception 'FAIL: nothing should carry from the ticked Pinatubo row, got %', to_json(v_row);
  end if;
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-02-05';
  if v_row.amount <> 4000 or v_row.carried_amount <> 2000 or v_row.carried_from <> '2020-01-25' then
    raise exception 'FAIL: Feb 5 Rent should hold its own 2000 plus the 2000 carried from Jan 25, got %', to_json(v_row);
  end if;
  update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now()
  where bill_item_id = v_rent and payday_date = '2020-02-05';
  if (select sum(amount) from public.ledger_entries where bill_item_id = v_rent and status = 'checked') <> 4000 then
    raise exception 'FAIL: Rent should count as paid once, as 4000 on Feb 5';
  end if;

  reset role;
  reset request.jwt.claim.sub;
end;
$$;

\echo 'carry unmatched rollovers: OK'
