-- Push notifications (20260921000040_notifications.sql). net.http_post is
-- stubbed by support/stub_auth.sql to record into net.test_requests, so every
-- check here is "which pushes would have gone out, to which device".

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_household uuid;
  v_member_a uuid;
  v_code text;
  v_cat uuid;
  v_bill uuid;
  v_entry uuid;
  v_count int;
  v_req jsonb;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
    'push-a@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Ana', 'household_name', 'Push House'),
    now(), now(), '', '', '', ''
  );
  select household_id, id into v_household, v_member_a from public.household_members where user_id = v_a;

  -- --- Token registration / RLS ---------------------------------------------
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_a::text, false);

  perform public.register_push_token('ExponentPushToken[device-a]');
  begin
    perform public.register_push_token('not-a-token');
    raise exception 'FAIL: a malformed push token should be rejected';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  select (public.create_household_invite()).code into v_code;
  reset role;
  reset request.jwt.claim.sub;

  -- --- Partner joins: only the existing member hears about it ---------------
  delete from net.test_requests;
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
    'push-b@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Ben', 'invite_code', v_code),
    now(), now(), '', '', '', ''
  );
  select body into v_req from net.test_requests;
  if (select count(*) from net.test_requests) <> 1
     or v_req -> 0 ->> 'to' <> 'ExponentPushToken[device-a]'
     or v_req -> 0 ->> 'title' <> 'Your partner joined'
     or v_req -> 0 ->> 'body' <> 'Ben used your invite and joined Push House' then
    raise exception 'FAIL: partner-joined push should go to A only, got %', v_req;
  end if;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_b::text, false);
  perform public.register_push_token('ExponentPushToken[device-b]');

  -- A member only ever sees/deletes their own tokens.
  select count(*) into v_count from public.push_tokens;
  if v_count <> 1 then
    raise exception 'FAIL: B should see only their own token (saw %)', v_count;
  end if;
  delete from public.push_tokens where token = 'ExponentPushToken[device-a]';

  -- --- Partner activity: the actor's partner, never the actor ---------------
  perform set_config('request.jwt.claim.sub', v_a::text, false);
  reset role;
  if not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[device-a]') then
    raise exception 'FAIL: B must not be able to delete A''s token';
  end if;
  delete from net.test_requests;
  set role authenticated;

  insert into public.incomes (member_id, label, amount, recurring_day)
  values (v_member_a, 'Salary', 40000, 5);
  insert into public.categories (household_id, kind, name)
  values (v_household, 'bill', 'Utilities') returning id into v_cat;
  insert into public.bill_items (category_id, label, amount, recurring_day)
  values (v_cat, 'Internet', 1500, 5) returning id into v_bill;
  perform public.materialize_payday(v_household, '2027-01-05');
  select id into v_entry from public.ledger_entries where bill_item_id = v_bill;
  update public.ledger_entries set status = 'checked', checked_by = v_a, checked_at = now() where id = v_entry;

  reset role;
  select count(*) into v_count from net.test_requests
  where body -> 0 ->> 'to' = 'ExponentPushToken[device-a]' or jsonb_array_length(body) <> 1;
  if v_count <> 0 then
    raise exception 'FAIL: A must never be pushed about their own actions';
  end if;
  select jsonb_agg(body -> 0 ->> 'body' order by id) into v_req from net.test_requests;
  if v_req <> '["Ana added Salary (₱ 40,000)", "Ana added Utilities", "Ana paid Internet (₱ 1,500)"]'::jsonb then
    raise exception 'FAIL: unexpected partner-activity pushes to B: %', v_req;
  end if;

  -- --- Master switch --------------------------------------------------------
  delete from net.test_requests;
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_b::text, false);
  perform public.set_notifications_enabled(false);
  perform set_config('request.jwt.claim.sub', v_a::text, false);
  insert into public.categories (household_id, kind, name) values (v_household, 'bill', 'Quiet');
  reset role;
  if exists (select 1 from net.test_requests) then
    raise exception 'FAIL: B turned notifications off, nothing should be sent';
  end if;
  update public.household_members set notifications_enabled = true where user_id = v_b;

  -- --- Scheduled: bill due tomorrow, payday today ---------------------------
  delete from net.test_requests;
  perform private.send_daily_reminders('2027-02-04');
  select jsonb_agg(r.body order by r.id) into v_req from net.test_requests r;
  if jsonb_array_length(v_req) <> 1
     or jsonb_array_length(v_req -> 0) <> 2
     or v_req -> 0 -> 0 ->> 'title' <> 'Bill due tomorrow'
     or v_req -> 0 -> 0 ->> 'body' <> 'Internet ₱ 1,500' then
    raise exception 'FAIL: bill-due reminder should reach both members once, got %', v_req;
  end if;

  -- Already ticked off on tomorrow's checklist: no reminder.
  delete from net.test_requests;
  perform private.send_daily_reminders('2027-01-04');
  if exists (select 1 from net.test_requests) then
    raise exception 'FAIL: a bill already paid for tomorrow needs no reminder';
  end if;

  delete from net.test_requests;
  perform private.send_daily_reminders('2027-02-05');
  select jsonb_agg(r.body order by r.id) into v_req from net.test_requests r;
  if jsonb_array_length(v_req) <> 1 or v_req -> 0 -> 0 ->> 'title' <> 'New month, new checklist' then
    raise exception 'FAIL: payday push expected on the month''s first payday, got %', v_req;
  end if;

  if not exists (
    select 1 from cron.job
    where jobname = 'daily-push-reminders' and schedule = '0 1 * * *'
      and command = 'select private.send_daily_reminders()'
  ) then
    raise exception 'FAIL: daily reminder cron job (09:00 Asia/Taipei = 01:00 UTC) not scheduled';
  end if;

  -- Re-registering a device under another account moves the token.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_b::text, false);
  perform public.register_push_token('ExponentPushToken[device-a]');
  reset role;
  reset request.jwt.claim.sub;
  if (select user_id from public.push_tokens where token = 'ExponentPushToken[device-a]') <> v_b then
    raise exception 'FAIL: re-registering a token should move it to the new user';
  end if;
end;
$$;

\echo 'notifications: OK'
