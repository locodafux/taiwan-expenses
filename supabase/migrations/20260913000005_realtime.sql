-- Realtime (docs/techspec.md §3, "decided": live partner updates via
-- Postgres change subscriptions on the ledger/category tables). Supabase
-- does not add tables to the realtime publication by default - RLS still
-- applies to what a subscribed client actually receives.
alter publication supabase_realtime add table
  public.categories,
  public.incomes,
  public.bill_items,
  public.ledger_entries;
