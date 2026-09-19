-- In-app bug reports (firstmate spec, 2026-09-18). Users submit from the
-- Settings screen; reports are read from the Supabase dashboard (service
-- role bypasses RLS), so there is deliberately NO select/update/delete policy
-- for authenticated clients - a user can never read anyone's reports back,
-- including their own.
create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  -- set null (not cascade) so reports survive delete_own_account().
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  household_id uuid references public.households(id) on delete set null,
  description text not null check (length(trim(description)) > 0),
  app_version text,
  platform text,
  os_version text,
  created_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

-- Insert as yourself only, tagged with your own household (or none).
create policy "users insert own bug_reports" on public.bug_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (household_id is null or household_id in (select private.user_household_ids()))
  );
