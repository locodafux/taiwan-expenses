-- Verifies 20260921000010_manual_contributions.sql: extra deposits (manual)
-- coexist with the planned fund row for the same payday, stack on the same
-- day, and are never rewritten by re-materialization.

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_household_id uuid;
  v_member_id uuid;
  v_fund_cat uuid;
  v_amount numeric;
  v_count int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'manual-owner@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Manual Owner'),
    now(), now(), '', '', '', ''
  );

  select household_id, id into v_household_id, v_member_id
  from public.household_members where user_id = v_user_id;

  insert into public.incomes (member_id, label, amount, recurring_day)
  values (v_member_id, 'Salary', 10000, 5);
  insert into public.categories (household_id, kind, name, sort_order, rule)
  values (v_household_id, 'fund', 'Savings', 1, '{"type":"remainder","percent":100}'::jsonb)
  returning id into v_fund_cat;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_user_id::text, false);

  perform public.materialize_payday(v_household_id, '2027-01-05');

  -- Two deposits into the fund on the payday itself: neither collides with
  -- the planned row nor with each other.
  insert into public.ledger_entries (household_id, category_id, payday_date, amount, status, manual)
  values (v_household_id, v_fund_cat, '2027-01-05', 1500, 'checked', true),
         (v_household_id, v_fund_cat, '2027-01-05', 250, 'checked', true);

  perform public.materialize_payday(v_household_id, '2027-01-05');

  select count(*) into v_count from public.ledger_entries
  where category_id = v_fund_cat and payday_date = '2027-01-05';
  if v_count <> 3 then
    raise exception 'FAIL: expected planned row + 2 deposits, saw % rows', v_count;
  end if;

  select amount into v_amount from public.ledger_entries
  where category_id = v_fund_cat and payday_date = '2027-01-05' and not manual;
  if v_amount <> 10000 then
    raise exception 'FAIL: planned row should still be 10000, saw %', v_amount;
  end if;

  select sum(amount) into v_amount from public.ledger_entries
  where category_id = v_fund_cat and payday_date = '2027-01-05' and manual;
  if v_amount <> 1750 then
    raise exception 'FAIL: re-materializing must leave deposits alone, saw %', v_amount;
  end if;

  -- Planned rows are still one per (category, payday).
  begin
    insert into public.ledger_entries (household_id, category_id, payday_date, amount)
    values (v_household_id, v_fund_cat, '2027-01-05', 1);
    raise exception 'FAIL: a second planned fund row should be rejected';
  exception when unique_violation then null;
  end;

  reset role;
  reset request.jwt.claim.sub;
end $$;
