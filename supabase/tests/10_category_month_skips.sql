-- Verifies 20260920000003_category_month_skips.sql: the per-month fund skip,
-- and the accompanying fix that re-materialization must never rewrite an
-- entry that has already been ticked off. Self-contained fixtures (doesn't
-- touch seed.sql's household, which 03_allocation.sql asserts exact numbers on).

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_household_id uuid;
  v_member_id uuid;
  v_bill_cat uuid;
  v_fund_cat uuid;
  v_amount numeric;
  v_status text;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'skips-owner@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Skips Owner'),
    now(), now(), '', '', '', ''
  );

  select household_id, id into v_household_id, v_member_id
  from public.household_members where user_id = v_user_id;

  -- One payday (the 5th) carrying 10000 - 2000 = 8000 of cushion, all of
  -- which the single remainder fund absorbs.
  insert into public.incomes (member_id, label, amount, recurring_day)
  values (v_member_id, 'Salary', 10000, 5);

  insert into public.categories (household_id, kind, name, sort_order)
  values (v_household_id, 'bill', 'Bills', 0) returning id into v_bill_cat;
  insert into public.bill_items (category_id, label, amount, recurring_day)
  values (v_bill_cat, 'Rent', 2000, 5);

  insert into public.categories (household_id, kind, name, sort_order, rule)
  values (v_household_id, 'fund', 'Savings', 1, '{"type":"remainder","percent":100}'::jsonb)
  returning id into v_fund_cat;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_user_id::text, false);

  -- --- Baseline -----------------------------------------------------------
  perform public.materialize_payday(v_household_id, '2027-01-05');

  select amount, status into v_amount, v_status from public.ledger_entries
  where category_id = v_fund_cat and payday_date = '2027-01-05';
  if v_amount <> 8000 or v_status <> 'pending' then
    raise exception 'FAIL: baseline fund entry should be 8000/pending, saw %/%', v_amount, v_status;
  end if;

  -- --- Skipping the fund for that month -----------------------------------
  insert into public.category_month_skips (household_id, category_id, month)
  values (v_household_id, v_fund_cat, '2027-01-01');

  perform public.materialize_payday(v_household_id, '2027-01-05');

  select amount, status into v_amount, v_status from public.ledger_entries
  where category_id = v_fund_cat and payday_date = '2027-01-05';
  if v_amount <> 0 or v_status <> 'skipped' then
    raise exception 'FAIL: a skipped month should zero the fund entry, saw %/%', v_amount, v_status;
  end if;

  -- The bill on the same payday is untouched: only funds can be skipped.
  select amount, status into v_amount, v_status from public.ledger_entries
  where category_id = v_bill_cat and payday_date = '2027-01-05';
  if v_amount <> 2000 or v_status <> 'pending' then
    raise exception 'FAIL: skipping a fund must not touch that payday''s bills, saw %/%', v_amount, v_status;
  end if;

  -- The skip is scoped to its month: February is unaffected.
  perform public.materialize_payday(v_household_id, '2027-02-05');
  select amount, status into v_amount, v_status from public.ledger_entries
  where category_id = v_fund_cat and payday_date = '2027-02-05';
  if v_amount <> 8000 or v_status <> 'pending' then
    raise exception 'FAIL: a January skip must not affect February, saw %/%', v_amount, v_status;
  end if;

  -- --- Un-skipping restores the originally planned amount ------------------
  delete from public.category_month_skips where category_id = v_fund_cat and month = '2027-01-01';
  perform public.materialize_payday(v_household_id, '2027-01-05');

  select amount, status into v_amount, v_status from public.ledger_entries
  where category_id = v_fund_cat and payday_date = '2027-01-05';
  if v_amount <> 8000 or v_status <> 'pending' then
    raise exception 'FAIL: un-skipping should restore 8000/pending, saw %/%', v_amount, v_status;
  end if;

  -- --- An already-ticked entry is never rewritten --------------------------
  update public.ledger_entries
  set amount = 7500, status = 'checked', checked_by = v_user_id, checked_at = now()
  where category_id = v_fund_cat and payday_date = '2027-01-05';
  update public.ledger_entries
  set amount = 1800, status = 'checked', checked_by = v_user_id, checked_at = now()
  where category_id = v_bill_cat and payday_date = '2027-01-05';

  perform public.materialize_payday(v_household_id, '2027-01-05');

  select amount, status into v_amount, v_status from public.ledger_entries
  where category_id = v_fund_cat and payday_date = '2027-01-05';
  if v_amount <> 7500 or v_status <> 'checked' then
    raise exception 'FAIL: re-materializing must not rewrite a checked fund entry, saw %/%', v_amount, v_status;
  end if;

  select amount, status into v_amount, v_status from public.ledger_entries
  where category_id = v_bill_cat and payday_date = '2027-01-05';
  if v_amount <> 1800 or v_status <> 'checked' then
    raise exception 'FAIL: re-materializing must not rewrite a checked bill entry, saw %/%', v_amount, v_status;
  end if;

  -- Skipping a month whose entry is already checked leaves it checked too.
  insert into public.category_month_skips (household_id, category_id, month)
  values (v_household_id, v_fund_cat, '2027-01-01');
  perform public.materialize_payday(v_household_id, '2027-01-05');
  select amount, status into v_amount, v_status from public.ledger_entries
  where category_id = v_fund_cat and payday_date = '2027-01-05';
  if v_amount <> 7500 or v_status <> 'checked' then
    raise exception 'FAIL: a skip must not undo an entry already ticked off, saw %/%', v_amount, v_status;
  end if;

  -- --- month must be the first of a month ----------------------------------
  begin
    insert into public.category_month_skips (household_id, category_id, month)
    values (v_household_id, v_fund_cat, '2027-03-14');
    raise exception 'FAIL: a mid-month skip date should be rejected';
  exception when check_violation then null;
  end;

  reset role;
  reset request.jwt.claim.sub;
end $$;

-- --- Isolation: a skip never crosses households -----------------------------
do $$
declare
  v_other_id uuid := gen_random_uuid();
  v_other_household uuid;
  v_foreign_cat uuid;
  v_count int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_other_id, 'authenticated', 'authenticated',
    'skips-outsider@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Outsider'),
    now(), now(), '', '', '', ''
  );

  select c.id into v_foreign_cat
  from public.categories c
  join public.household_members m on m.household_id = c.household_id
  where m.user_id = (select id from auth.users where email = 'skips-owner@example.com')
    and c.kind = 'fund';

  select household_id into v_other_household from public.household_members where user_id = v_other_id;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_other_id::text, false);

  select count(*) into v_count from public.category_month_skips;
  if v_count <> 0 then
    raise exception 'FAIL: an outsider must not read another household''s skips (saw %)', v_count;
  end if;

  -- The BEFORE INSERT trigger rewrites household_id from the category, so a
  -- spoofed household_id can't sneak the row past the with-check. The trigger
  -- itself runs as the caller, so it raises "category ... not found" (the
  -- foreign category is invisible under RLS) before the policy is even
  -- reached - same shape as ledger_entries in 05_rls_security_audit.sql.
  begin
    insert into public.category_month_skips (household_id, category_id, month)
    values (v_other_household, v_foreign_cat, '2027-01-01');
    raise exception 'FAIL: skipping another household''s category should be rejected';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  delete from public.category_month_skips;

  reset role;
  reset request.jwt.claim.sub;

  select count(*) into v_count from public.category_month_skips;
  if v_count <> 1 then
    raise exception 'FAIL: the owner''s skip must survive an outsider''s delete (saw %)', v_count;
  end if;

  -- materialize_payday on a foreign household is still refused.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_other_id::text, false);
  begin
    perform public.materialize_payday(
      (select household_id from public.categories where id = v_foreign_cat), '2027-01-05');
    raise exception 'FAIL: materialize_payday on a foreign household should be rejected';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  reset role;
  reset request.jwt.claim.sub;
end $$;
