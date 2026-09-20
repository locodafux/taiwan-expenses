-- Household chat (captain's intent, 2026-09-18): one plain-text thread per
-- household, scoped to its members - never global/app-wide.
--
-- household_id is stored directly (not denormalized by trigger like
-- bill_items/incomes/ledger_entries) because a message has no parent row to
-- derive it from; the insert policy's with-check is what stops a client
-- writing into a household it isn't a member of.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Nullable + set null (not cascade) so one member deleting their account
  -- doesn't erase the shared thread for the partner who stays - matches the
  -- ownership call in 20260917000001_delete_account.sql. It can only ever be
  -- null after that deletion: the insert policy below requires it to equal
  -- auth.uid(), and `null = auth.uid()` is never true. The client falls back
  -- to "Someone" when a sender no longer matches a household_members row.
  sender_id uuid default auth.uid() references auth.users(id) on delete set null,
  body text not null check (length(trim(body)) > 0 and length(body) <= 2000),
  created_at timestamptz not null default now()
);

-- The only read pattern: newest N messages of one household.
create index messages_household_created_at_idx
  on public.messages (household_id, created_at desc);

alter table public.messages enable row level security;

-- Same flat household predicate as every other scoped table.
create policy "members read messages" on public.messages
  for select to authenticated
  using (household_id in (select private.user_household_ids()));

-- Insert into your own household, as yourself only - sender_id = auth.uid()
-- means a member can never write a row attributed to their partner.
create policy "members write messages" on public.messages
  for insert to authenticated
  with check (
    household_id in (select private.user_household_ids())
    and sender_id = (select auth.uid())
  );

-- Deliberately NO update/delete policy: editing and deleting messages are out
-- of scope, and leaving them out is also what keeps a member from rewriting or
-- removing their partner's messages.

-- Required for src/lib/realtime.ts's subscription to receive anything at all -
-- Supabase does not add tables to this publication by default and a missing
-- table fails silently (no error, no events).
alter publication supabase_realtime add table public.messages;
