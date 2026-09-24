-- Bug reports become "Feedback" (captain's call, 2026-09-23): feature requests
-- too, with a status so the household can see what's been done. The table
-- keeps its name - a shipped APK inserts into it.
--
-- status is maintained outside the app (Supabase dashboard / service role) as
-- work lands; clients get no update policy and can only file new items as
-- 'open'. Existing rows default to 'open'.
alter table public.bug_reports
  add column status text not null default 'open'
    check (status in ('open', 'planned', 'done'));

drop policy "users insert own bug_reports" on public.bug_reports;
create policy "users insert own bug_reports" on public.bug_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'open'
    and (household_id is null or household_id in (select private.user_household_ids()))
  );

-- The whole household's feedback, not just your own: in a two-person
-- household, seeing your partner's item marked done is the point.
create policy "members read household bug_reports" on public.bug_reports
  for select to authenticated
  using (household_id in (select private.user_household_ids()));
