-- Verifies public.delete_own_account() (firstmate spec: delete-account
-- feature) actually removes the account and its data, and handles the
-- solo-vs-shared-household split correctly:
--   - a solo deleter's whole household disappears (nothing orphaned).
--   - a deleter who shares a household with a partner only loses their own
--     membership/income/auth.users row - the household and its shared
--     categories/bills/ledger stay intact for the partner.
-- Self-contained fixtures (doesn't touch seed.sql's Leo/Ann household).

-- --- Scenario A: solo household -------------------------------------------
do $$
declare
  v_solo_id uuid := gen_random_uuid();
  v_household_id uuid;
  v_member_id uuid;
  v_category_id uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_solo_id, 'authenticated', 'authenticated',
    'solo-deleter@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Solo'),
    now(), now(), '', '', '', ''
  );

  select household_id, id into v_household_id, v_member_id
  from public.household_members where user_id = v_solo_id;

  insert into public.categories (household_id, kind, name, sort_order)
  values (v_household_id, 'bill', 'Solo Bills', 0)
  returning id into v_category_id;

  insert into public.bill_items (category_id, label, amount, recurring_day)
  values (v_category_id, 'Rent', 1000, 5);

  insert into public.incomes (member_id, label, amount, recurring_day)
  values (v_member_id, 'Solo salary', 5000, 5);

  insert into public.ledger_entries (category_id, payday_date, amount, checked_by, status)
  values (v_category_id, '2026-10-05', 1000, v_solo_id, 'checked');

  -- Call as the authenticated user themselves, as the real RPC would be.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_solo_id::text, false);
  perform public.delete_own_account();
  reset role;
  reset request.jwt.claim.sub;

  if exists (select 1 from auth.users where id = v_solo_id) then
    raise exception 'FAIL: solo deleter''s auth.users row should be gone';
  end if;
  if exists (select 1 from public.households where id = v_household_id) then
    raise exception 'FAIL: solo deleter''s household should be gone';
  end if;
  if exists (select 1 from public.household_members where household_id = v_household_id) then
    raise exception 'FAIL: solo deleter''s household_members row should be gone';
  end if;
  if exists (select 1 from public.categories where household_id = v_household_id) then
    raise exception 'FAIL: solo deleter''s categories should be gone';
  end if;
  if exists (select 1 from public.bill_items where category_id = v_category_id) then
    raise exception 'FAIL: solo deleter''s bill_items should be gone';
  end if;
  if exists (select 1 from public.incomes where member_id = v_member_id) then
    raise exception 'FAIL: solo deleter''s incomes should be gone';
  end if;
  if exists (select 1 from public.ledger_entries where category_id = v_category_id) then
    raise exception 'FAIL: solo deleter''s ledger_entries should be gone';
  end if;
end $$;

-- --- Scenario B: shared household ------------------------------------------
do $$
declare
  v_owner_id uuid := gen_random_uuid();
  v_partner_id uuid := gen_random_uuid();
  v_household_id uuid;
  v_owner_member_id uuid;
  v_partner_member_id uuid;
  v_category_id uuid;
  v_ledger_id uuid;
  v_invite_code text := encode(gen_random_bytes(6), 'hex');
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_owner_id, 'authenticated', 'authenticated',
    'owner-deleter@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Owner'),
    now(), now(), '', '', '', ''
  );

  select household_id, id into v_household_id, v_owner_member_id
  from public.household_members where user_id = v_owner_id;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (v_household_id, v_invite_code, v_owner_id, now() + interval '7 days');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_partner_id, 'authenticated', 'authenticated',
    'partner-stays@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Partner', 'invite_code', v_invite_code),
    now(), now(), '', '', '', ''
  );

  select id into v_partner_member_id from public.household_members where user_id = v_partner_id;

  insert into public.categories (household_id, kind, name, sort_order)
  values (v_household_id, 'bill', 'Shared Bills', 0)
  returning id into v_category_id;

  insert into public.incomes (member_id, label, amount, recurring_day)
  values (v_owner_member_id, 'Owner salary', 5000, 5);

  insert into public.ledger_entries (category_id, payday_date, amount, checked_by, status)
  values (v_category_id, '2026-10-05', 1000, v_owner_id, 'checked')
  returning id into v_ledger_id;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_id::text, false);
  perform public.delete_own_account();
  reset role;
  reset request.jwt.claim.sub;

  if exists (select 1 from auth.users where id = v_owner_id) then
    raise exception 'FAIL: owner''s auth.users row should be gone';
  end if;
  if not exists (select 1 from public.households where id = v_household_id) then
    raise exception 'FAIL: shared household should survive the owner''s deletion';
  end if;
  if exists (select 1 from public.household_members where id = v_owner_member_id) then
    raise exception 'FAIL: owner''s own household_members row should be gone';
  end if;
  if not exists (select 1 from public.household_members where id = v_partner_member_id) then
    raise exception 'FAIL: partner''s household_members row must survive';
  end if;
  if exists (select 1 from public.incomes where member_id = v_owner_member_id) then
    raise exception 'FAIL: owner''s own incomes should be gone';
  end if;
  if not exists (select 1 from public.categories where id = v_category_id) then
    raise exception 'FAIL: shared category must survive - it still belongs to the partner';
  end if;
  if not exists (select 1 from public.ledger_entries where id = v_ledger_id) then
    raise exception 'FAIL: shared ledger_entries row must survive';
  end if;
  if (select checked_by from public.ledger_entries where id = v_ledger_id) is not null then
    raise exception 'FAIL: ledger_entries.checked_by should be nulled out, not left dangling, once the owner is deleted';
  end if;
  if exists (select 1 from public.household_invites where created_by = v_owner_id) then
    raise exception 'FAIL: the invite the owner created should be cascaded away with them';
  end if;

  -- Now the partner is the sole remaining member - deleting them should
  -- finish tearing down the household and everything left in it.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_partner_id::text, false);
  perform public.delete_own_account();
  reset role;
  reset request.jwt.claim.sub;

  if exists (select 1 from auth.users where id = v_partner_id) then
    raise exception 'FAIL: partner''s auth.users row should be gone';
  end if;
  if exists (select 1 from public.households where id = v_household_id) then
    raise exception 'FAIL: household should be gone once its last member deletes their account';
  end if;
  if exists (select 1 from public.categories where household_id = v_household_id) then
    raise exception 'FAIL: shared categories should be gone once the household is gone';
  end if;
end $$;

select 'PASS: 06_delete_account' as result;
