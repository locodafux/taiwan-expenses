-- households was left out of the realtime publication, so a household-name
-- rename (settings.tsx) never propagated live to the other member's device
-- even though public.households already has a working RLS update policy
-- ("members update households", 20260913000002_rls.sql).
alter publication supabase_realtime add table
  public.households;
