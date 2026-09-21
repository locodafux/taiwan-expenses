-- A bill/loan with an end_date (the app's "number of payments" term) stays on
-- the checklist through its last due date and drops off after it.

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_household_id uuid;
  v_member_id uuid;
  v_bill_cat uuid;
  v_loan uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'term-owner@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Term Owner'),
    now(), now(), '', '', '', ''
  );

  select household_id, id into v_household_id, v_member_id
  from public.household_members where user_id = v_user_id;

  insert into public.incomes (member_id, label, amount, recurring_day)
  values (v_member_id, 'Salary', 10000, 5);
  insert into public.categories (household_id, kind, name)
  values (v_household_id, 'bill', 'Loans') returning id into v_bill_cat;
  insert into public.bill_items (category_id, label, amount, recurring_day, end_date)
  values (v_bill_cat, 'Car loan', 3000, 5, '2027-02-05') returning id into v_loan;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_user_id::text, false);

  perform public.materialize_payday(v_household_id, '2027-02-05');
  perform public.materialize_payday(v_household_id, '2027-03-05');

  if not exists (select 1 from public.ledger_entries where bill_item_id = v_loan and payday_date = '2027-02-05') then
    raise exception 'FAIL: the last payment (on the end_date) should still be on the checklist';
  end if;
  if exists (select 1 from public.ledger_entries where bill_item_id = v_loan and payday_date = '2027-03-05') then
    raise exception 'FAIL: a bill should drop off the checklist after its end_date';
  end if;

  reset role;
end;
$$;
