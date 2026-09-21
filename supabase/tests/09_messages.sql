-- Verifies public.messages RLS (firstmate spec: household-scoped chat).
-- The whole point of the feature is that a thread never leaks past its
-- household, so this covers both directions of isolation plus sender
-- spoofing, cross-household immutability, and what happens when a member deletes their
-- account. Self-contained fixtures (doesn't touch seed.sql's household).

-- --- Isolation between two separate households -----------------------------
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_household_a uuid;
  v_household_b uuid;
  v_message_b uuid;
  v_count int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
     'chat-a@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Chat A'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
     'chat-b@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Chat B'),
     now(), now(), '', '', '', '');

  select household_id into v_household_a from public.household_members where user_id = v_a;
  select household_id into v_household_b from public.household_members where user_id = v_b;

  -- Seeded as the table owner (bypasses RLS) so A has something of B's to try to read.
  insert into public.messages (household_id, sender_id, body)
  values (v_household_b, v_b, 'household B private message')
  returning id into v_message_b;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_a::text, false);

  -- sender_id defaults to auth.uid().
  insert into public.messages (household_id, body) values (v_household_a, 'hello partner');

  select count(*) into v_count from public.messages where household_id = v_household_a;
  if v_count <> 1 then
    raise exception 'FAIL: A should read their own household''s message (saw %)', v_count;
  end if;

  select count(*) into v_count from public.messages where household_id = v_household_b;
  if v_count <> 0 then
    raise exception 'FAIL: A must not read household B''s messages (saw %)', v_count;
  end if;

  begin
    insert into public.messages (household_id, body) values (v_household_b, 'intruding');
    raise exception 'FAIL: posting into a foreign household should be rejected';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (household_id, sender_id, body)
    values (v_household_a, v_b, 'spoofed sender');
    raise exception 'FAIL: posting as another user should be rejected';
  exception when insufficient_privilege then null;
  end;

  -- No update/delete policy at all: both are silently no-ops under RLS
  -- (zero rows matched), never an actual edit.
  update public.messages set body = 'tampered' where id = v_message_b;
  delete from public.messages where id = v_message_b;

  reset role;
  reset request.jwt.claim.sub;

  select count(*) into v_count from public.messages
  where id = v_message_b and body = 'household B private message';
  if v_count <> 1 then
    raise exception 'FAIL: household B''s message must survive A''s update/delete attempts';
  end if;

  -- Deleting your own message is allowed since 20260921000030_chat_delete.sql
  -- (covered in 13_chat_delete.sql).

  -- Empty/whitespace bodies are rejected by the check constraint.
  begin
    insert into public.messages (household_id, sender_id, body) values (v_household_a, v_a, '   ');
    raise exception 'FAIL: a blank message body should be rejected';
  exception when check_violation then null;
  end;
end $$;

-- --- A shared thread survives one member deleting their account -------------
do $$
declare
  v_owner_id uuid := gen_random_uuid();
  v_partner_id uuid := gen_random_uuid();
  v_household_id uuid;
  v_invite_code text := encode(extensions.gen_random_bytes(6), 'hex');
  v_count int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_owner_id, 'authenticated', 'authenticated',
    'chat-owner@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Chat Owner'),
    now(), now(), '', '', '', ''
  );

  select household_id into v_household_id from public.household_members where user_id = v_owner_id;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (v_household_id, v_invite_code, v_owner_id, now() + interval '7 days');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_partner_id, 'authenticated', 'authenticated',
    'chat-partner@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Chat Partner', 'invite_code', v_invite_code),
    now(), now(), '', '', '', ''
  );

  -- Both members post into the one shared thread.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_id::text, false);
  insert into public.messages (household_id, body) values (v_household_id, 'from the owner');
  perform set_config('request.jwt.claim.sub', v_partner_id::text, false);
  insert into public.messages (household_id, body) values (v_household_id, 'from the partner');

  select count(*) into v_count from public.messages where household_id = v_household_id;
  if v_count <> 2 then
    raise exception 'FAIL: both members should see the shared thread (saw %)', v_count;
  end if;

  perform set_config('request.jwt.claim.sub', v_owner_id::text, false);
  perform public.delete_own_account();
  reset role;
  reset request.jwt.claim.sub;

  select count(*) into v_count from public.messages where household_id = v_household_id;
  if v_count <> 2 then
    raise exception 'FAIL: the thread should survive one member deleting their account (saw %)', v_count;
  end if;

  select count(*) into v_count from public.messages
  where household_id = v_household_id and body = 'from the owner' and sender_id is null;
  if v_count <> 1 then
    raise exception 'FAIL: the departed member''s messages should stay with sender_id nulled';
  end if;
end $$;
