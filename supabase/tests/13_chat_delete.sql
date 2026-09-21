-- Verifies 20260921000030_chat_delete.sql: a member deletes only their own
-- messages, and "clear chat history" hides the thread for that member only.
do $$
declare
  v_owner_id uuid := gen_random_uuid();
  v_partner_id uuid := gen_random_uuid();
  v_outsider_id uuid := gen_random_uuid();
  v_household_id uuid;
  v_outsider_household uuid;
  v_invite_code text := encode(extensions.gen_random_bytes(6), 'hex');
  v_owner_msg uuid;
  v_partner_msg uuid;
  v_count int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', v_owner_id, 'authenticated', 'authenticated',
     'del-owner@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Del Owner'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_outsider_id, 'authenticated', 'authenticated',
     'del-outsider@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'Del Outsider'),
     now(), now(), '', '', '', '');

  select household_id into v_household_id from public.household_members where user_id = v_owner_id;
  select household_id into v_outsider_household from public.household_members where user_id = v_outsider_id;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (v_household_id, v_invite_code, v_owner_id, now() + interval '7 days');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_partner_id, 'authenticated', 'authenticated',
    'del-partner@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Del Partner', 'invite_code', v_invite_code),
    now(), now(), '', '', '', ''
  );

  -- Backdated so the clear below (stamped now()) lands after them.
  insert into public.messages (household_id, sender_id, body, created_at) values
    (v_household_id, v_owner_id, 'owner message', now() - interval '2 minutes')
  returning id into v_owner_msg;
  insert into public.messages (household_id, sender_id, body, created_at) values
    (v_household_id, v_partner_id, 'partner message', now() - interval '1 minute')
  returning id into v_partner_msg;

  set role authenticated;

  -- --- Delete: own only ------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_owner_id::text, false);
  delete from public.messages where id = v_partner_msg;  -- silently filtered by RLS
  delete from public.messages where id = v_owner_msg;

  perform set_config('request.jwt.claim.sub', v_outsider_id::text, false);
  delete from public.messages where id = v_partner_msg;

  reset role;
  if exists (select 1 from public.messages where id = v_owner_msg) then
    raise exception 'FAIL: a member should be able to delete their own message';
  end if;
  if not exists (select 1 from public.messages where id = v_partner_msg) then
    raise exception 'FAIL: neither the partner nor an outsider may delete someone else''s message';
  end if;

  -- --- Clear history: per member only ----------------------------------------
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_id::text, false);
  perform public.clear_chat_history(v_household_id);

  select count(*) into v_count from public.messages where household_id = v_household_id;
  if v_count <> 0 then
    raise exception 'FAIL: history should be hidden for the member who cleared it (saw %)', v_count;
  end if;

  -- Clearing twice just moves the marker (upsert), no conflict error.
  perform public.clear_chat_history(v_household_id);

  perform set_config('request.jwt.claim.sub', v_partner_id::text, false);
  select count(*) into v_count from public.messages where household_id = v_household_id;
  if v_count <> 1 then
    raise exception 'FAIL: the partner''s view must be untouched by the other''s clear (saw %)', v_count;
  end if;

  select count(*) into v_count from public.chat_clears;
  if v_count <> 0 then
    raise exception 'FAIL: a member must not read their partner''s clear marker';
  end if;

  -- The partner can't clear on the owner's behalf...
  begin
    insert into public.chat_clears (user_id, household_id) values (v_owner_id, v_household_id);
    raise exception 'FAIL: writing another member''s clear marker should be rejected';
  exception when insufficient_privilege then null;
  end;

  -- ...and an outsider can't write a marker for a household they're not in.
  perform set_config('request.jwt.claim.sub', v_outsider_id::text, false);
  begin
    perform public.clear_chat_history(v_household_id);
    raise exception 'FAIL: clearing a foreign household''s chat should be rejected';
  exception when insufficient_privilege then null;
  end;

  -- New messages after the clear show again for the member who cleared.
  perform set_config('request.jwt.claim.sub', v_partner_id::text, false);
  insert into public.messages (household_id, body, created_at)
  values (v_household_id, 'after the clear', now() + interval '1 second');

  perform set_config('request.jwt.claim.sub', v_owner_id::text, false);
  select count(*) into v_count from public.messages
  where household_id = v_household_id and body = 'after the clear';
  if v_count <> 1 then
    raise exception 'FAIL: messages sent after a clear should show again';
  end if;

  reset role;
  reset request.jwt.claim.sub;
end $$;
