-- Delete-account feature (firstmate spec): lets a signed-in user permanently
-- delete their own account and everything scoped to them.
--
-- Ownership decision (documented per spec, since this app is household-
-- shared): categories/bill_items/ledger_entries/incomes belong to the
-- HOUSEHOLD as a whole, not to either member individually.
--   - Solo household (deleter is the only member): the whole household and
--     everything under it is destroyed - nothing is left orphaned.
--   - Shared household (a partner is still a member): only the deleting
--     user's own household_members row (and the incomes tied to it via
--     member_id) is removed. The household itself and its shared
--     categories/bills/ledger history are left intact for the partner -
--     deleting your own account must never delete data your partner still
--     relies on.
-- In both cases the caller's own auth.users row is deleted at the end.
--
-- Two FKs into auth.users have no ON DELETE action (RESTRICT by default),
-- which would otherwise block deleting the row entirely:
--   - household_invites.created_by (not null) -> cascade the invite away;
--     it's just a join code, not data either member reads once redeemed.
--   - household_invites.redeemed_by / ledger_entries.checked_by (nullable)
--     -> set null, preserving the shared row they're attached to.
alter table public.household_invites
  drop constraint household_invites_created_by_fkey,
  add constraint household_invites_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.household_invites
  drop constraint household_invites_redeemed_by_fkey,
  add constraint household_invites_redeemed_by_fkey
    foreign key (redeemed_by) references auth.users(id) on delete set null;

alter table public.ledger_entries
  drop constraint ledger_entries_checked_by_fkey,
  add constraint ledger_entries_checked_by_fkey
    foreign key (checked_by) references auth.users(id) on delete set null;

-- SECURITY DEFINER so it can delete the caller's own auth.users row - the
-- authenticated JWT alone can never do that, same elevated-privilege pattern
-- as handle_new_user/create_household_invite. Always operates on auth.uid(),
-- never a parameter, so a caller can only ever delete themselves.
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_member_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select household_id into v_household_id
  from public.household_members
  where user_id = v_uid;

  if v_household_id is not null then
    select count(*) into v_member_count
    from public.household_members
    where household_id = v_household_id;

    if v_member_count <= 1 then
      -- Solo: cascades categories/bill_items/incomes/ledger_entries/
      -- household_members/household_invites (all declared ON DELETE CASCADE
      -- from households in 20260913000001_schema.sql).
      delete from public.households where id = v_household_id;
    else
      -- Shared: only this user's own membership (+ their incomes, cascaded
      -- via member_id) goes. Household/categories/bills/ledger stay for the
      -- partner.
      delete from public.household_members where user_id = v_uid;
    end if;
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
