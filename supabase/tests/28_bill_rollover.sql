-- Verifies 20261006000001_bill_rollover.sql: a bill row left unticked rolls
-- into the same bill's next row (carried_amount/carried_from) and is marked
-- 'carried'; it keeps rolling until ticked; a re-run never double-carries; a
-- ticked row carries nothing; the auto-tick setting makes past bills count as
-- paid so they never carry; and preview_payday shows the carry for the next
-- payday only, writing nothing. Paydays are in 2020 so the test holds
-- whatever today's date is.

do $$
declare
  v_a uuid := gen_random_uuid();
  v_household uuid;
  v_member uuid;
  v_bill_cat uuid;
  v_rent uuid;
  v_row public.ledger_entries;
  v_n int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
    'bill-rollover-a@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Ana'),
    now(), now(), '', '', '', ''
  );
  select household_id, id into v_household, v_member from public.household_members where user_id = v_a;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_a::text, false);

  insert into public.incomes (member_id, label, amount, recurring_day)
  values (v_member, 'Salary', 10000, 5);
  insert into public.categories (household_id, kind, name, sort_order, start_month)
  values (v_household, 'bill', 'Bills', 0, '2020-01-01') returning id into v_bill_cat;
  insert into public.bill_items (category_id, label, amount, recurring_day)
  values (v_bill_cat, 'Rent', 2000, 5) returning id into v_rent;

  -- --- January: nothing before it ---------------------------------------------
  perform public.materialize_payday(v_household, '2020-01-05');
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-01-05';
  if v_row.amount <> 2000 or v_row.carried_amount <> 0 or v_row.status <> 'pending' then
    raise exception 'FAIL: January rent should be a plain pending row, got %', to_json(v_row);
  end if;

  -- --- February: unpaid January rent rolls in --------------------------------
  perform public.materialize_payday(v_household, '2020-02-05');
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-02-05';
  if v_row.amount <> 4000 or v_row.carried_amount <> 2000 or v_row.carried_from <> '2020-01-05' then
    raise exception 'FAIL: February rent should hold two months, got %', to_json(v_row);
  end if;
  if (select status from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-01-05') <> 'carried' then
    raise exception 'FAIL: January rent should be marked carried';
  end if;

  -- --- Re-running never double-carries ---------------------------------------
  perform public.materialize_payday(v_household, '2020-02-05');
  perform public.materialize_payday(v_household, '2020-02-05');
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-02-05';
  if v_row.amount <> 4000 or v_row.carried_amount <> 2000 then
    raise exception 'FAIL: re-materializing changed the carry, got %', to_json(v_row);
  end if;

  -- --- Still unpaid, it keeps rolling ----------------------------------------
  perform public.materialize_payday(v_household, '2020-03-05');
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-03-05';
  if v_row.amount <> 6000 or v_row.carried_amount <> 4000 or v_row.carried_from <> '2020-02-05' then
    raise exception 'FAIL: March rent should hold three months, got %', to_json(v_row);
  end if;

  -- --- Ticking it settles everything: nothing carries from a ticked row ------
  update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now()
  where bill_item_id = v_rent and payday_date = '2020-03-05';
  perform public.materialize_payday(v_household, '2020-04-05');
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-04-05';
  if v_row.amount <> 2000 or v_row.carried_amount <> 0 or v_row.carried_from is not null then
    raise exception 'FAIL: nothing should carry from a ticked bill, got %', to_json(v_row);
  end if;
  -- Counted once: only the ticked March row is checked, and it holds all three months.
  if (select sum(amount) from public.ledger_entries where bill_item_id = v_rent and status = 'checked') <> 6000 then
    raise exception 'FAIL: carried rows must stay out of the checked total';
  end if;

  -- --- Preview: the next payday shows the carry, a further one does not, ----
  -- and nothing is written or marked.
  select count(*) into v_n from public.ledger_entries;
  select p.amount, p.carried_amount, p.carried_from into v_row.amount, v_row.carried_amount, v_row.carried_from
  from public.preview_payday(v_household, '2020-05-05') p where p.bill_item_id = v_rent;
  if v_row.amount <> 4000 or v_row.carried_amount <> 2000 or v_row.carried_from <> '2020-04-05' then
    raise exception 'FAIL: the next payday''s preview should include the carry, got %', to_json(v_row);
  end if;
  select p.amount, p.carried_amount into v_row.amount, v_row.carried_amount
  from public.preview_payday(v_household, '2020-06-05') p where p.bill_item_id = v_rent;
  if v_row.amount <> 2000 or v_row.carried_amount <> 0 then
    raise exception 'FAIL: a payday two ahead must not repeat the carry, got %', to_json(v_row);
  end if;
  if (select count(*) from public.ledger_entries) <> v_n
     or (select status from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-04-05') <> 'pending' then
    raise exception 'FAIL: preview must not write or mark anything';
  end if;

  -- --- Auto-tick on: the past April bill counts as paid, so it never carries -
  update public.households set auto_check_past_paydays = true where id = v_household;
  perform public.materialize_payday(v_household, '2020-05-05');
  select * into v_row from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-05-05';
  if v_row.amount <> 2000 or v_row.carried_amount <> 0
     or (select status from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-04-05') <> 'checked' then
    raise exception 'FAIL: auto-ticked bills must not carry, got %', to_json(v_row);
  end if;

  reset role;
  reset request.jwt.claim.sub;
end;
$$;

\echo 'bill rollover: OK'
