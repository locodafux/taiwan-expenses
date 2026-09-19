-- Verifies public.update_own_display_name() (profile settings) renames only
-- the caller's own household_members row, trims input, and rejects blank /
-- overlong names. Uses seed.sql's Leo & Ann household.
do $$
declare
  v_leo uuid := (select id from auth.users where email = 'leo@example.com');
  v_ann uuid := (select id from auth.users where email = 'ann@example.com');
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_leo::text, false);
  perform public.update_own_display_name('  Leonardo  ');

  begin
    perform public.update_own_display_name('   ');
    raise exception 'FAIL: blank name should be rejected';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  begin
    perform public.update_own_display_name(repeat('x', 51));
    raise exception 'FAIL: overlong name should be rejected';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  reset role;
  reset request.jwt.claim.sub;

  if (select display_name from public.household_members where user_id = v_leo) <> 'Leonardo' then
    raise exception 'FAIL: caller''s display_name should be updated and trimmed';
  end if;
  if (select display_name from public.household_members where user_id = v_ann) <> 'Ann' then
    raise exception 'FAIL: partner''s display_name must be untouched';
  end if;

  -- Direct table UPDATEs stay blocked: no client UPDATE policy on household_members.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', v_leo::text, false);
  update public.household_members set display_name = 'Hacked' where user_id = v_leo;
  reset role;
  reset request.jwt.claim.sub;
  if (select display_name from public.household_members where user_id = v_leo) <> 'Leonardo' then
    raise exception 'FAIL: direct UPDATE on household_members should be filtered by RLS';
  end if;
end $$;

-- anon can't call it at all.
do $$
begin
  set role anon;
  begin
    perform public.update_own_display_name('Nope');
    raise exception 'FAIL: anon should not be able to execute update_own_display_name';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

select 'PASS: 08_update_display_name' as result;
