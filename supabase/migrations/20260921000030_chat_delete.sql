-- Household chat: delete your own messages, and clear the history for yourself.
-- Reverses 20260920000002_messages.sql's deliberate "no delete policy".

-- (1) A member deletes their own messages only - never their partner's. A
-- hard delete, so it's gone for both members; realtime delivers the DELETE
-- (see src/lib/realtime.ts for why that listener is unfiltered).
create policy "members delete own messages" on public.messages
  for delete to authenticated
  using (
    household_id in (select private.user_household_ids())
    and sender_id = (select auth.uid())
  );

-- (2) "Clear chat history" is per member: a marker of when *this* user
-- cleared the thread. The messages themselves stay, so the partner's view is
-- untouched; anything sent after the marker shows again.
create table public.chat_clears (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, household_id)
);

alter table public.chat_clears enable row level security;

-- Only your own marker, only in your own household. No delete policy: there's
-- no "un-clear" in the UI.
create policy "members read own chat clear" on public.chat_clears
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "members write own chat clear" on public.chat_clears
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and household_id in (select private.user_household_ids())
  );

create policy "members update own chat clear" on public.chat_clears
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and household_id in (select private.user_household_ids())
  );

-- Enforced in the read policy itself (not just a client filter), so cleared
-- messages are hidden from every read path: the thread, the unread count and
-- realtime.
drop policy "members read messages" on public.messages;
create policy "members read messages" on public.messages
  for select to authenticated
  using (
    household_id in (select private.user_household_ids())
    and created_at > coalesce(
      (select c.cleared_at from public.chat_clears c
        where c.household_id = messages.household_id and c.user_id = (select auth.uid())),
      '-infinity'
    )
  );

-- Stamped with the server clock, not the client's: a phone whose clock runs
-- ahead would otherwise hide messages sent after the clear.
create or replace function public.clear_chat_history(p_household_id uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.chat_clears (user_id, household_id, cleared_at)
  values (auth.uid(), p_household_id, now())
  on conflict (user_id, household_id) do update set cleared_at = excluded.cleared_at;
$$;
