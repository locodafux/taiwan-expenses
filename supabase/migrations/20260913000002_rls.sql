-- Row-level security (docs/techspec.md §4): a SECURITY DEFINER helper avoids
-- Postgres's "infinite recursion detected in policy" (42P17) that a naive
-- households <-> household_members mutual-join policy would hit.

create schema if not exists private;

create function private.user_household_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select household_id from public.household_members
  where user_id = (select auth.uid())
$$;

grant usage on schema private to authenticated;
grant execute on function private.user_household_ids() to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.categories enable row level security;
alter table public.incomes enable row level security;
alter table public.bill_items enable row level security;
alter table public.ledger_entries enable row level security;

-- households: members can read/update their own household. No client insert
-- policy — a household is only ever created by the public.handle_new_user
-- signup trigger (SECURITY DEFINER, bypasses RLS as the function owner).
create policy "members read households" on public.households
  for select to authenticated
  using (id in (select private.user_household_ids()));

create policy "members update households" on public.households
  for update to authenticated
  using (id in (select private.user_household_ids()))
  with check (id in (select private.user_household_ids()));

-- household_members: members can see their household's roster. Deliberately
-- NO insert/update/delete policy for authenticated clients: membership rows
-- are only ever created by the SECURITY DEFINER signup trigger (direct signup
-- or invite redemption). A plain "user_id = auth.uid()" insert-check policy
-- (as sketched illustratively in docs/techspec.md §4) would let any signed-in
-- user self-assign membership in ANY household by guessing its id, so it is
-- intentionally not implemented that way here.
create policy "members read household_members" on public.household_members
  for select to authenticated
  using (household_id in (select private.user_household_ids()));

-- household_invites: members can view/revoke invites for their own household.
-- Creation and redemption both happen through SECURITY DEFINER functions
-- (create_household_invite / the signup trigger), never a client insert —
-- a client insert policy would let a member hand-roll a weak/guessable code,
-- bypassing create_household_invite()'s gen_random_bytes(6) generation.
create policy "members read household_invites" on public.household_invites
  for select to authenticated
  using (household_id in (select private.user_household_ids()));

create policy "members revoke household_invites" on public.household_invites
  for delete to authenticated
  using (household_id in (select private.user_household_ids()));

-- categories / incomes / bill_items / ledger_entries: same household-scoped
-- predicate, reused for every action.
create policy "members read categories" on public.categories
  for select to authenticated using (household_id in (select private.user_household_ids()));
create policy "members write categories" on public.categories
  for insert to authenticated with check (household_id in (select private.user_household_ids()));
create policy "members update categories" on public.categories
  for update to authenticated
  using (household_id in (select private.user_household_ids()))
  with check (household_id in (select private.user_household_ids()));
-- Deliberately no DELETE policy: categories carry ledger_entries history via
-- ON DELETE CASCADE, and hard-deleting one would destroy real financial
-- history with no undo. Removal from use is done via the existing
-- `archived` flag (docs/plan.md §1), not deletion.

create policy "members read incomes" on public.incomes
  for select to authenticated using (household_id in (select private.user_household_ids()));
create policy "members write incomes" on public.incomes
  for insert to authenticated with check (household_id in (select private.user_household_ids()));
create policy "members update incomes" on public.incomes
  for update to authenticated
  using (household_id in (select private.user_household_ids()))
  with check (household_id in (select private.user_household_ids()));
create policy "members delete incomes" on public.incomes
  for delete to authenticated using (household_id in (select private.user_household_ids()));

create policy "members read bill_items" on public.bill_items
  for select to authenticated using (household_id in (select private.user_household_ids()));
create policy "members write bill_items" on public.bill_items
  for insert to authenticated with check (household_id in (select private.user_household_ids()));
create policy "members update bill_items" on public.bill_items
  for update to authenticated
  using (household_id in (select private.user_household_ids()))
  with check (household_id in (select private.user_household_ids()));
create policy "members delete bill_items" on public.bill_items
  for delete to authenticated using (household_id in (select private.user_household_ids()));

create policy "members read ledger_entries" on public.ledger_entries
  for select to authenticated using (household_id in (select private.user_household_ids()));
create policy "members write ledger_entries" on public.ledger_entries
  for insert to authenticated with check (household_id in (select private.user_household_ids()));
create policy "members update ledger_entries" on public.ledger_entries
  for update to authenticated
  using (household_id in (select private.user_household_ids()))
  with check (household_id in (select private.user_household_ids()));
create policy "members delete ledger_entries" on public.ledger_entries
  for delete to authenticated using (household_id in (select private.user_household_ids()));
