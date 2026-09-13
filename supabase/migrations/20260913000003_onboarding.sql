-- Onboarding flow (docs/plan.md §2): the first signup creates a household;
-- a second signup carrying a valid invite code joins the inviter's household
-- instead. Both paths run in a SECURITY DEFINER trigger on auth.users so they
-- can bypass RLS for the one moment a user has no household_members row yet.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_invite public.household_invites;
  v_household_id uuid;
begin
  v_code := new.raw_user_meta_data ->> 'invite_code';

  if v_code is not null then
    select * into v_invite
    from public.household_invites
    where code = v_code
      and redeemed_by is null
      and expires_at > now()
    for update;

    if v_invite.id is not null then
      update public.household_invites
        set redeemed_by = new.id, redeemed_at = now()
        where id = v_invite.id;
      v_household_id := v_invite.household_id;
    end if;
  end if;

  if v_household_id is null then
    insert into public.households (name)
    values (coalesce(new.raw_user_meta_data ->> 'household_name', 'Our Household'))
    returning id into v_household_id;
  end if;

  insert into public.household_members (household_id, user_id, display_name)
  values (
    v_household_id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Callable from the client once signed in, to generate a code for a partner
-- to redeem at signup (docs/plan.md §2 step 2).
create function public.create_household_invite(p_ttl interval default interval '7 days')
returns public.household_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_row public.household_invites;
begin
  select household_id into v_household_id
  from public.household_members
  where user_id = auth.uid();

  if v_household_id is null then
    raise exception 'caller has no household';
  end if;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (v_household_id, encode(extensions.gen_random_bytes(6), 'hex'), auth.uid(), now() + p_ttl)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_household_invite(interval) to authenticated;
