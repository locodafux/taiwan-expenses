-- Verifies the invite-redemption flow joins the inviting household rather
-- than creating a new one (firstmate spec, Tests item b). Exercised for real
-- by seed.sql (Ann's signup carries Leo's invite code); this asserts the
-- outcome, then does a second, from-scratch redemption to be sure.

do $$
declare
  v_leo_household uuid;
  v_ann_household uuid;
  v_invite record;
begin
  select household_id into v_leo_household from public.household_members
    where user_id = (select id from auth.users where email = 'leo@example.com');
  select household_id into v_ann_household from public.household_members
    where user_id = (select id from auth.users where email = 'ann@example.com');

  if v_leo_household is null or v_ann_household is null then
    raise exception 'FAIL: expected both Leo and Ann to have a household_members row';
  end if;

  if v_leo_household <> v_ann_household then
    raise exception 'FAIL: Ann joined a different household (%) than Leo (%) instead of redeeming the invite',
      v_ann_household, v_leo_household;
  end if;

  select * into v_invite from public.household_invites where created_by =
    (select id from auth.users where email = 'leo@example.com');

  if v_invite.redeemed_by is distinct from (select id from auth.users where email = 'ann@example.com') then
    raise exception 'FAIL: invite should be marked redeemed by Ann';
  end if;

  if v_invite.redeemed_at is null then
    raise exception 'FAIL: invite redeemed_at should be set';
  end if;

  if (select count(*) from public.household_members where household_id = v_leo_household) <> 2 then
    raise exception 'FAIL: expected exactly 2 members (Leo+Ann) in the shared household, got %',
      (select count(*) from public.household_members where household_id = v_leo_household);
  end if;
end $$;

-- From-scratch check: a brand-new household + invite + redeeming signup,
-- independent of seed.sql's fixture, to isolate the mechanism itself.
do $$
declare
  v_inviter_id uuid := gen_random_uuid();
  v_redeemer_id uuid := gen_random_uuid();
  v_inviter_household uuid;
  v_redeemer_household uuid;
  v_code text := encode(gen_random_bytes(6), 'hex');
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_inviter_id, 'authenticated', 'authenticated',
    'inviter@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Inviter'),
    now(), now(), '', '', '', ''
  );

  select household_id into v_inviter_household from public.household_members where user_id = v_inviter_id;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (v_inviter_household, v_code, v_inviter_id, now() + interval '7 days');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_redeemer_id, 'authenticated', 'authenticated',
    'redeemer@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Redeemer', 'invite_code', v_code),
    now(), now(), '', '', '', ''
  );

  select household_id into v_redeemer_household from public.household_members where user_id = v_redeemer_id;

  if v_redeemer_household <> v_inviter_household then
    raise exception 'FAIL: redeemer joined household % instead of inviter''s household %',
      v_redeemer_household, v_inviter_household;
  end if;

  if (select redeemed_by from public.household_invites where code = v_code) <> v_redeemer_id then
    raise exception 'FAIL: invite row was not marked redeemed by the redeemer';
  end if;
end $$;

-- An expired code must NOT be redeemable (falls back to creating a new household).
do $$
declare
  v_owner_id uuid := gen_random_uuid();
  v_late_id uuid := gen_random_uuid();
  v_owner_household uuid;
  v_late_household uuid;
  v_code text := encode(gen_random_bytes(6), 'hex');
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_owner_id, 'authenticated', 'authenticated',
    'owner@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Owner'),
    now(), now(), '', '', '', ''
  );

  select household_id into v_owner_household from public.household_members where user_id = v_owner_id;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (v_owner_household, v_code, v_owner_id, now() - interval '1 minute');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_late_id, 'authenticated', 'authenticated',
    'late@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Late', 'invite_code', v_code),
    now(), now(), '', '', '', ''
  );

  select household_id into v_late_household from public.household_members where user_id = v_late_id;

  if v_late_household = v_owner_household then
    raise exception 'FAIL: an expired invite code must not be redeemable';
  end if;
end $$;

select 'PASS: 02_invite_redemption' as result;
