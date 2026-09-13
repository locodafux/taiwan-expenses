-- household_members was left out of 20260913000005_realtime.sql's publication,
-- so a partner joining via invite code never showed up live for a household
-- member who already had the app open (dashboard header, "invite your
-- partner" checklist step) - found while testing concurrent two-member use
-- (src/lib/realtime.ts's useRealtimeSync).
alter publication supabase_realtime add table
  public.household_members;
