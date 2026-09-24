-- Verifies 20260924000030_auto_check_past_paydays.sql: with the household
-- setting on, materialize_payday ticks off past paydays' pending rows,
-- leaves ₱0 rows pending and the current payday alone, and doesn't push
-- "paid" notifications for them; with it off, nothing changes.
-- Past paydays are in 2020 and the "current" one in 2099, so the test holds
-- whatever today's date is.

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_household uuid;
  v_member uuid;
  v_code text;
  v_bill_cat uuid;
  v_fund_cat uuid;
  v_summary jsonb;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
    'autocheck-a@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Ana'),
    now(), now(), '', '', '', ''
  );
  select household_id, id into v_household, v_member from public.household_members where user_id = v_a;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_a::text, false);
  select (public.create_household_invite()).code into v_code;
  reset role;

  -- A partner with a device, so a stray "paid" push would be observable.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
    'autocheck-b@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Ben', 'invite_code', v_code),
    now(), now(), '', '', '', ''
  );
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_b::text, false);
  perform public.register_push_token('ExponentPushToken[autocheck-b]');
  perform set_config('request.jwt.claim.sub', v_a::text, false);

  insert into public.incomes (member_id, label, amount, recurring_day)
  values (v_member, 'Salary', 10000, 5);
  insert into public.categories (household_id, kind, name, sort_order)
  values (v_household, 'bill', 'Bills', 0) returning id into v_bill_cat;
  insert into public.bill_items (category_id, label, amount, recurring_day)
  values (v_bill_cat, 'Rent', 2000, 5);
  insert into public.categories (household_id, kind, name, sort_order, rule)
  values (v_household, 'fund', 'Savings', 1, '{"type":"remainder","percent":100}'::jsonb)
  returning id into v_fund_cat;

  -- January 2020: bill + fund pending. February 2020: bill pending, fund
  -- edited down to ₱0 (nothing to set aside).
  perform public.materialize_payday(v_household, '2020-01-05');
  perform public.materialize_payday(v_household, '2020-02-05');
  update public.ledger_entries set amount = 0
  where category_id = v_fund_cat and payday_date = '2020-02-05';

  -- --- Off (the default): nothing is swept ----------------------------------
  perform public.materialize_payday(v_household, '2099-01-05');
  select jsonb_object_agg(payday_date || ' ' || category_id, status) into v_summary
  from public.ledger_entries where household_id = v_household and payday_date < '2099-01-01';
  if (select count(*) from jsonb_each_text(v_summary)) <> 4
     or exists (select 1 from jsonb_each_text(v_summary) e where e.value <> 'pending') then
    raise exception 'FAIL: with the setting off past rows must stay pending, saw %', v_summary;
  end if;

  -- --- On: past pending rows are ticked, ₱0 and current ones aren't -------
  reset role;
  delete from net.test_requests;
  set role authenticated;
  update public.households set auto_check_past_paydays = true where id = v_household;
  perform public.materialize_payday(v_household, '2099-01-05');

  if exists (select 1 from public.ledger_entries
             where household_id = v_household and payday_date < '2099-01-01'
               and status <> case when amount = 0 then 'pending' else 'checked' end) then
    raise exception 'FAIL: past pending rows should be checked and ₱0 ones left pending';
  end if;
  if exists (select 1 from public.ledger_entries
             where household_id = v_household and payday_date < '2099-01-01' and status = 'checked'
               and (checked_by is not null or checked_at is null)) then
    raise exception 'FAIL: auto-checked rows should have checked_at and no checked_by';
  end if;
  if exists (select 1 from public.ledger_entries
             where household_id = v_household and payday_date = '2099-01-05' and status <> 'pending') then
    raise exception 'FAIL: the current payday must never be auto-checked';
  end if;

  reset role;
  if exists (select 1 from net.test_requests) then
    raise exception 'FAIL: auto-checking must not push "paid" notifications';
  end if;
  reset request.jwt.claim.sub;
end;
$$;

\echo 'auto-check past paydays: OK'
