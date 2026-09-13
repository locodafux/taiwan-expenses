-- Local dev seed (docs/plan.md §4): one household, two members, the real
-- numbers from the original taiwan-fund-planner.html so local dev looks like
-- the real budget from day one. Two auth.users inserts double as a live
-- exercise of the onboarding flow: Leo's insert creates the household (no
-- invite_code), Ann's insert carries an invite_code and joins his household
-- instead of creating her own (docs/plan.md §2).

do $$
declare
  v_leo_id uuid := gen_random_uuid();
  v_ann_id uuid := gen_random_uuid();
  v_household_id uuid;
  v_leo_member_id uuid;
  v_ann_member_id uuid;
  v_invite_code text := encode(gen_random_bytes(6), 'hex');
  v_expenses_cat uuid;
  v_debt_cat uuid;
  v_taiwan_cat uuid;
  v_emergency_cat uuid;
  v_savings_cat uuid;
  v_excess_cat uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_leo_id, 'authenticated', 'authenticated',
    'leo@example.com', crypt('password123', gen_salt('bf')), now(),
    now(), now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Leo', 'household_name', 'Leo & Ann'),
    now(), now(), '', '', '', ''
  );

  select household_id, id into v_household_id, v_leo_member_id
  from public.household_members where user_id = v_leo_id;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (v_household_id, v_invite_code, v_leo_id, now() + interval '7 days');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_ann_id, 'authenticated', 'authenticated',
    'ann@example.com', crypt('password123', gen_salt('bf')), now(),
    now(), now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Ann', 'invite_code', v_invite_code),
    now(), now(), '', '', '', ''
  );

  select id into v_ann_member_id from public.household_members where user_id = v_ann_id;

  -- Incomes (docs/plan.md §4 / the captain's real numbers).
  insert into public.incomes (member_id, label, amount, recurring_day) values
    (v_leo_member_id, 'Leo salary (1st half)', 20000, 5),
    (v_leo_member_id, 'Leo salary (2nd half)', 20000, 20),
    (v_ann_member_id, 'Ann salary (1st half)', 9000, 15),
    (v_ann_member_id, 'Ann salary (2nd half)', 9000, 30);

  -- Bill-kind categories.
  insert into public.categories (household_id, kind, name, color, sort_order)
  values (v_household_id, 'bill', 'Expenses', '#8a8a8a', 0)
  returning id into v_expenses_cat;

  insert into public.categories (household_id, kind, name, color, sort_order)
  values (v_household_id, 'bill', 'Debt', '#c0392b', 0)
  returning id into v_debt_cat;

  -- Expenses (taiwan-fund-planner.html:324-342), steady every month.
  insert into public.bill_items (category_id, label, amount, recurring_day) values
    (v_expenses_cat, 'House rent', 4000, 30),
    (v_expenses_cat, 'Kuryente (electric)', 1500, 30),
    (v_expenses_cat, 'Water', 1500, 15),
    (v_expenses_cat, 'Internet', 1000, 15),
    (v_expenses_cat, 'Internet', 1600, 20),
    (v_expenses_cat, 'Food', 5000, 5),
    (v_expenses_cat, 'Food', 5000, 20),
    (v_expenses_cat, 'Move It fare', 1420, 5),
    (v_expenses_cat, 'Move It fare', 1420, 20),
    (v_expenses_cat, 'Bus fare', 360, 5),
    (v_expenses_cat, 'Bus fare', 360, 20),
    (v_expenses_cat, 'Jeepney fare', 840, 5),
    (v_expenses_cat, 'Jeepney fare', 840, 20),
    (v_expenses_cat, 'Claude subscription', 1500, 20),
    (v_expenses_cat, 'Netflix', 600, 20),
    (v_expenses_cat, 'Mobile load', 300, 20),
    (v_expenses_cat, 'Medicine', 2000, 5);

  -- Debts (taiwan-fund-planner.html:346-355), end_date retires each one on
  -- the same monthly schedule as the original's DEBT_ITEMS_BY_MONTH.
  insert into public.bill_items (category_id, label, amount, recurring_day, end_date) values
    (v_debt_cat, 'Macbook', 3700, 15, '2026-10-31'),
    (v_debt_cat, 'Atome', 4500, 5, '2026-10-31'),
    (v_debt_cat, 'Shopee', 3000, 15, '2026-11-30'),
    (v_debt_cat, 'Nano', 2620, 20, '2027-03-31');

  -- Fund-kind categories (docs/plan.md §1's three-tier design).
  insert into public.categories (household_id, kind, name, color, sort_order, rule) values
    (v_household_id, 'fund', 'Taiwan Fund', '#2d7d6f', 1,
      jsonb_build_object('type', 'goal', 'target_amount', 80000, 'target_date', '2027-03-05'))
    returning id into v_taiwan_cat;

  insert into public.categories (household_id, kind, name, color, sort_order, rule) values
    (v_household_id, 'fund', 'Emergency Fund', '#b8860b', 2,
      jsonb_build_object('type', 'capped_percent', 'percent', 30, 'cap', 100000))
    returning id into v_emergency_cat;

  insert into public.categories (household_id, kind, name, color, sort_order, rule) values
    (v_household_id, 'fund', 'Savings', '#3b6fa0', 3,
      jsonb_build_object('type', 'remainder', 'percent', 50))
    returning id into v_savings_cat;

  insert into public.categories (household_id, kind, name, color, sort_order, rule) values
    (v_household_id, 'fund', 'Excess', '#6b4c9a', 4,
      jsonb_build_object('type', 'remainder', 'percent', 20))
    returning id into v_excess_cat;
end $$;
