-- Tick guard for carried bill rows. An app build from before the bill rollover
-- (20261006000001) draws a 'carried' bill row as an ordinary unticked row with
-- a live checkbox. Its money already lives in the bill's next row, so ticking
-- it too would count that payment twice (balances, history, archive). Refuse
-- that one transition; the next payday's raised row stays tickable and settles
-- everything. Current builds never offer the checkbox on a carried row, and a
-- fund row has no checkbox in any build, so only bill rows are guarded.
create function private.refuse_ticking_carried_bill()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'this bill was carried to its next payday - tick it there';
end;
$$;

create trigger ledger_entries_refuse_ticking_carried_bill
  before update of status on public.ledger_entries
  for each row
  when (old.status = 'carried' and new.status = 'checked' and old.bill_item_id is not null)
  execute function private.refuse_ticking_carried_bill();
