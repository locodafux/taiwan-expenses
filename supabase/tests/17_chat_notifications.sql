-- Chat pushes (20260924000010_chat_notifications.sql): a message pushes to the
-- sender's partner, never to the sender, tagged so the app can recognise it.

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_household uuid;
  v_code text;
  v_req jsonb;
  v_text text;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
    'chatpush-a@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Ana', 'household_name', 'Chat House'),
    now(), now(), '', '', '', ''
  );
  select household_id into v_household from public.household_members where user_id = v_a;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_a::text, false);
  perform public.register_push_token('ExponentPushToken[chat-a]');
  select (public.create_household_invite()).code into v_code;
  reset role;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
    'chatpush-b@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Ben', 'invite_code', v_code),
    now(), now(), '', '', '', ''
  );

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_b::text, false);
  perform public.register_push_token('ExponentPushToken[chat-b]');

  -- A sends: only B's device is pushed, titled with A's name.
  reset role;
  delete from net.test_requests;
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_a::text, false);
  insert into public.messages (household_id, body) values (v_household, 'Groceries done?');
  reset role;
  select jsonb_agg(r.body order by r.id) into v_req from net.test_requests r;
  if v_req <> '[[{"to": "ExponentPushToken[chat-b]", "title": "Ana", "body": "Groceries done?", "sound": "default", "data": {"type": "chat"}}]]'::jsonb then
    raise exception 'FAIL: chat push should go to B only, got %', v_req;
  end if;

  -- A long message is trimmed to 180 characters for the push.
  delete from net.test_requests;
  set role authenticated;
  insert into public.messages (household_id, body) values (v_household, repeat('x', 500));
  reset role;
  select body -> 0 ->> 'body' into v_text from net.test_requests;
  if length(v_text) <> 180 or right(v_text, 1) <> '…' then
    raise exception 'FAIL: long chat message should be trimmed to 180 chars, got %', v_text;
  end if;

  -- Other pushes keep their shape: no data key when none is given.
  delete from net.test_requests;
  set role authenticated;
  insert into public.categories (household_id, kind, name) values (v_household, 'bill', 'Rent');
  reset role;
  select body -> 0 into v_req from net.test_requests;
  if v_req ? 'data' or v_req ->> 'body' <> 'Ana added Rent' then
    raise exception 'FAIL: non-chat push changed shape, got %', v_req;
  end if;

  -- B turned notifications off: A's message sends nothing.
  delete from net.test_requests;
  update public.household_members set notifications_enabled = false where user_id = v_b;
  set role authenticated;
  insert into public.messages (household_id, body) values (v_household, 'Hello?');
  reset role;
  if exists (select 1 from net.test_requests) then
    raise exception 'FAIL: B turned notifications off, no chat push expected';
  end if;
  reset request.jwt.claim.sub;
end;
$$;

\echo 'chat notifications: OK'
