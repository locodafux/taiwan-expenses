-- Persists whether a fund category's goal-reached celebration has already
-- fired (docs/plan.md's highest-priority design-research item), so the
-- one-time full-screen celebration triggers exactly once per goal
-- completion instead of refiring on every render/app-open once the balance
-- is at/above target. Reuses the existing "members update categories" RLS
-- policy (20260913000002_rls.sql) - no new policy needed.
alter table public.categories add column goal_celebrated_at timestamptz;
