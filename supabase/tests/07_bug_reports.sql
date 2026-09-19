-- Verifies bug_reports RLS (firstmate spec: in-app bug report): an
-- authenticated user can insert a report as themselves only, tagged with
-- their own household only, and can never read reports back. Reports also
-- survive the reporter deleting their account.
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_household_a uuid;
  v_household_b uuid;
  v_count int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
     'bug-a@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'A'),
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
     'bug-b@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', 'B'),
     now(), now(), '', '', '', '');

  select household_id into v_household_a from public.household_members where user_id = v_a;
  select household_id into v_household_b from public.household_members where user_id = v_b;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_a::text, false);

  -- user_id defaults to auth.uid().
  insert into public.bug_reports (household_id, description, app_version, platform, os_version)
  values (v_household_a, 'Checklist froze', '1.0.0', 'android', '14');

  begin
    insert into public.bug_reports (user_id, description) values (v_b, 'spoofed reporter');
    raise exception 'FAIL: inserting a bug report as another user should be rejected';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.bug_reports (household_id, description) values (v_household_b, 'foreign household');
    raise exception 'FAIL: tagging a bug report with a foreign household should be rejected';
  exception when insufficient_privilege then null;
  end;

  select count(*) into v_count from public.bug_reports;
  if v_count <> 0 then
    raise exception 'FAIL: users must not be able to read bug reports (saw %)', v_count;
  end if;

  perform public.delete_own_account();
  reset role;
  reset request.jwt.claim.sub;

  select count(*) into v_count from public.bug_reports
  where description = 'Checklist froze' and user_id is null and household_id is null;
  if v_count <> 1 then
    raise exception 'FAIL: bug report should survive account deletion with user/household nulled';
  end if;
end $$;
