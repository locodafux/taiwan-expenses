-- Verifies 20261005000001_fund_rollover.sql: when a payday is materialized,
-- the previous payday's unticked, non-zero fund rows are added to the same
-- fund (carried_amount/carried_from say how much and from when) and marked
-- 'carried'; bills never carry; a re-run never double-carries; a ticked or ₱0
-- row stays put; a carried amount left unticked rolls on again; and
-- preview_payday shows the carry for the next payday only, writing nothing.
-- Paydays are in 2020 so the test holds whatever today's date is.

do $$
declare
  v_a uuid := gen_random_uuid();
  v_household uuid;
  v_member uuid;
  v_bill_cat uuid;
  v_fund_cat uuid;
  v_base numeric;
  v_row public.ledger_entries;
  v_prev public.ledger_entries;
  v_n int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
    'rollover-a@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
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
  values (v_bill_cat, 'Rent', 2000, 5);
  insert into public.categories (household_id, kind, name, sort_order, rule, start_month)
  values (v_household, 'fund', 'Savings', 1, '{"type":"remainder","percent":100}'::jsonb, '2020-01-01')
  returning id into v_fund_cat;

  -- --- January: nothing before it, nothing carried ---------------------------
  perform public.materialize_payday(v_household, '2020-01-05');
  select * into v_row from public.ledger_entries where category_id = v_fund_cat and payday_date = '2020-01-05';
  v_base := v_row.amount;
  if v_base <= 0 or v_row.carried_amount <> 0 or v_row.carried_from is not null or v_row.status <> 'pending' then
    raise exception 'FAIL: January fund row should be a plain pending row, got %', to_json(v_row);
  end if;

  -- --- February: January's unticked fund rolls in; its bill does not --------
  perform public.materialize_payday(v_household, '2020-02-05');
  select * into v_row from public.ledger_entries where category_id = v_fund_cat and payday_date = '2020-02-05';
  if v_row.amount <> 2 * v_base or v_row.carried_amount <> v_base or v_row.carried_from <> '2020-01-05' then
    raise exception 'FAIL: February fund should hold its own plus January''s, got %', to_json(v_row);
  end if;
  if (select status from public.ledger_entries where category_id = v_fund_cat and payday_date = '2020-01-05') <> 'carried' then
    raise exception 'FAIL: January fund row should be marked carried';
  end if;
  if exists (select 1 from public.ledger_entries where bill_item_id is not null and (status <> 'pending' or carried_amount <> 0)) then
    raise exception 'FAIL: bill rows must not carry';
  end if;

  -- --- Re-running never double-carries --------------------------------------
  perform public.materialize_payday(v_household, '2020-02-05');
  perform public.materialize_payday(v_household, '2020-02-05');
  select * into v_row from public.ledger_entries where category_id = v_fund_cat and payday_date = '2020-02-05';
  if v_row.amount <> 2 * v_base or v_row.carried_amount <> v_base then
    raise exception 'FAIL: re-materializing changed the carry, got %', to_json(v_row);
  end if;

  -- --- Left unticked again, the whole amount keeps rolling forward ---------
  perform public.materialize_payday(v_household, '2020-03-05');
  select * into v_row from public.ledger_entries where category_id = v_fund_cat and payday_date = '2020-03-05';
  if v_row.amount <> 3 * v_base or v_row.carried_amount <> 2 * v_base or v_row.carried_from <> '2020-02-05' then
    raise exception 'FAIL: March fund should hold three paydays'' worth, got %', to_json(v_row);
  end if;

  -- --- A ticked row is done: nothing carries from it ------------------------
  update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now()
  where category_id = v_fund_cat and payday_date = '2020-03-05';
  perform public.materialize_payday(v_household, '2020-04-05');
  select * into v_row from public.ledger_entries where category_id = v_fund_cat and payday_date = '2020-04-05';
  if v_row.amount <> v_base or v_row.carried_amount <> 0 or v_row.carried_from is not null then
    raise exception 'FAIL: nothing should carry from a ticked row, got %', to_json(v_row);
  end if;
  -- The carried money is counted once: only the ticked March row is checked.
  if (select sum(amount) from public.ledger_entries where category_id = v_fund_cat and status = 'checked') <> 3 * v_base
     or (select count(*) from public.ledger_entries where category_id = v_fund_cat and status = 'carried') <> 2 then
    raise exception 'FAIL: carried rows must stay out of the checked total';
  end if;

  -- --- A ₱0 row carries nothing and stays pending ---------------------------
  update public.ledger_entries set amount = 0 where category_id = v_fund_cat and payday_date = '2020-04-05';
  perform public.materialize_payday(v_household, '2020-05-05');
  select * into v_row from public.ledger_entries where category_id = v_fund_cat and payday_date = '2020-05-05';
  if v_row.amount <> v_base or v_row.carried_amount <> 0
     or (select status from public.ledger_entries where category_id = v_fund_cat and payday_date = '2020-04-05') <> 'pending' then
    raise exception 'FAIL: a ₱0 fund row must not carry or be marked carried';
  end if;

  -- --- Preview: the next payday shows the carry, a further one does not, ---
  -- and nothing is written or marked.
  select count(*) into v_n from public.ledger_entries;
  select p.amount, p.carried_amount, p.carried_from into v_row.amount, v_row.carried_amount, v_row.carried_from
  from public.preview_payday(v_household, '2020-06-05') p where p.category_id = v_fund_cat;
  if v_row.amount <> 2 * v_base or v_row.carried_amount <> v_base or v_row.carried_from <> '2020-05-05' then
    raise exception 'FAIL: the next payday''s preview should include the carry, got %', to_json(v_row);
  end if;
  select p.amount, p.carried_amount into v_row.amount, v_row.carried_amount
  from public.preview_payday(v_household, '2020-07-05') p where p.category_id = v_fund_cat;
  if v_row.amount <> v_base or v_row.carried_amount <> 0 then
    raise exception 'FAIL: a payday two ahead must not repeat the carry, got %', to_json(v_row);
  end if;
  if (select count(*) from public.ledger_entries) <> v_n
     or (select status from public.ledger_entries where category_id = v_fund_cat and payday_date = '2020-05-05') <> 'pending' then
    raise exception 'FAIL: preview must not write or mark anything';
  end if;

  reset role;
  reset request.jwt.claim.sub;
end;
$$;

\echo 'fund rollover: OK'
