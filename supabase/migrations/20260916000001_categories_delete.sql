-- Allow members to hard-delete a category. Captain's explicit call: this
-- cascades away any bill_items/ledger_entries history tied to it too
-- (schema-level ON DELETE CASCADE, see 20260913000001_schema.sql) — not a
-- gap to guard against, so no dependent-row check is added here. The client
-- is responsible for warning the user before deleting a category that has
-- existing history.
create policy "members delete categories" on public.categories
  for delete to authenticated using (household_id in (select private.user_household_ids()));
