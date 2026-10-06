-- Verifies 20261007000001_carried_bill_tick_guard.sql: a carried bill row can't
-- be ticked (an old app build would double-count it), the bill's next row can,
-- and the guard leaves everything else alone: a carried fund row, an untick /
-- re-pending of the carried row, and the rollover itself. Paydays are in 2020
-- so the test holds whatever today's date is.

do $$
declare
  v_a uuid := gen_random_uuid();
  v_household uuid;
  v_member uuid;
  v_bill_cat uuid;
  v_fund_cat uuid;
  v_rent uuid;
  v_src uuid;
  v_fund_src uuid;
  v_refused boolean;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
    'tick-guard-a@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
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
  insert into public.categories (household_id, kind, name, sort_order, rule, start_month)
  values (v_household, 'fund', 'Trip', 1, '{"type":"remainder","percent":100}'::jsonb, '2020-01-01')
  returning id into v_fund_cat;

  -- January and February: January's unticked rent and Trip money both carry.
  perform public.materialize_payday(v_household, '2020-01-05');
  perform public.materialize_payday(v_household, '2020-02-05');

  select id into v_src from public.ledger_entries where bill_item_id = v_rent and payday_date = '2020-01-05';
  select id into v_fund_src from public.ledger_entries
  where category_id = v_fund_cat and bill_item_id is null and payday_date = '2020-01-05';
  if (select status from public.ledger_entries where id = v_src) <> 'carried'
     or (select status from public.ledger_entries where id = v_fund_src) <> 'carried' then
    raise exception 'FAIL: setup - January rent and Trip rows should both be carried';
  end if;

  -- --- Ticking the carried bill row is refused, and nothing changes ---------
  v_refused := false;
  begin
    update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now() where id = v_src;
  exception when others then
    v_refused := sqlerrm like '%carried to its next payday%';
  end;
  if not v_refused then
    raise exception 'FAIL: ticking a carried bill row should be refused';
  end if;
  if (select status from public.ledger_entries where id = v_src) <> 'carried' then
    raise exception 'FAIL: a refused tick must leave the row carried';
  end if;

  -- --- Other edits to the carried row still go through ----------------------
  update public.ledger_entries set amount = 2000 where id = v_src;
  update public.ledger_entries set status = 'pending' where id = v_src;
  update public.ledger_entries set status = 'carried' where id = v_src;

  -- --- The next row is tickable, and that settles the money exactly once ----
  update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now()
  where bill_item_id = v_rent and payday_date = '2020-02-05';
  if (select sum(amount) from public.ledger_entries where bill_item_id = v_rent and status = 'checked') <> 4000 then
    raise exception 'FAIL: only the raised February row should be checked, holding both months';
  end if;

  -- --- Fund rows are not guarded (no build draws a checkbox on them) --------
  update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now() where id = v_fund_src;

  -- --- A plain pending bill row ticks as ever; so does the rollover ---------
  perform public.materialize_payday(v_household, '2020-03-05');
  update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now()
  where bill_item_id = v_rent and payday_date = '2020-03-05';
  perform public.materialize_payday(v_household, '2020-04-05');

  reset role;
  reset request.jwt.claim.sub;
end;
$$;

\echo 'carried bill tick guard: OK'
