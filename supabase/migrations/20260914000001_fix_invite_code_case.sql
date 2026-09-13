-- Bug fix: invite code redemption was case-sensitive while
-- create_household_invite() only ever generates lowercase hex codes and the
-- join screen's TextInput uses autoCapitalize="characters" - a partner typing
-- the code exactly as shown on the inviter's screen would submit an
-- uppercased string that silently failed to match, and handle_new_user()
-- would then fall through to creating a brand-new household instead of
-- raising an error. Normalize (trim + lowercase) on lookup so entry is
-- case/whitespace-insensitive regardless of client behavior.
create or replace function public.handle_new_user()
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
  v_code := lower(trim(new.raw_user_meta_data ->> 'invite_code'));

  if v_code is not null and v_code <> '' then
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
