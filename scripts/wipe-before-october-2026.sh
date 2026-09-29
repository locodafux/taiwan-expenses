#!/usr/bin/env bash
# One-off (already run 2026-09-29): permanently delete every ledger_entries row with
# payday_date < 2026-10-01 from the LINKED live Supabase project, in every household.
# Fund balances are just sums of ledger rows, so there is nothing else to reset; October starts at 0.
# Usage: scripts/wipe-before-october-2026.sh <backup-dir>   (backup dir must be outside the repo)
set -euo pipefail
BACKUP=${1:?usage: $0 <backup-dir outside repo>}
REF=oxnzczubwjoviyddajge
[ "$(cat supabase/.temp/project-ref)" = "$REF" ] || { echo "linked project is not $REF" >&2; exit 1; }
case "$(cd "$BACKUP" && pwd -P)" in "$(git rev-parse --show-toplevel)"*) echo "backup must be outside the repo" >&2; exit 1;; esac
q() { supabase db query --linked -o json "$1" 2>/dev/null; }

echo "== backup (every public table) -> $BACKUP"
for t in households household_members categories incomes bill_items ledger_entries messages chat_clears bug_reports household_invites push_tokens; do
  q "select * from public.$t" | python3 -c "
import sys,json; r=json.load(sys.stdin)['rows']; json.dump(r,open('$BACKUP/$t.json','w'),indent=1,default=str); print('$t',len(r))"
done
chmod 600 "$BACKUP"/*.json

echo "== before: rows to delete / keep"
q "select count(*) filter (where payday_date < '2026-10-01') as to_delete, count(*) filter (where payday_date >= '2026-10-01') as to_keep from public.ledger_entries" | python3 -c "import sys,json; print(json.load(sys.stdin)['rows'])"

echo "== delete (single atomic statement), rows deleted per household"
q "with d as (delete from public.ledger_entries where payday_date < '2026-10-01' returning household_id)
   select h.name, d.household_id, count(*) as deleted from d join public.households h on h.id = d.household_id group by 1,2 order by 3 desc" \
 | python3 -c "
import sys,json; r=json.load(sys.stdin)['rows']
for x in r: print(x['household_id'], x['name'], x['deleted'])
print('total', sum(x['deleted'] for x in r))"

echo "== verify"
q "select count(*) filter (where payday_date < '2026-10-01') as pre_oct_left, count(*) filter (where payday_date >= '2026-10-01') as oct_plus from public.ledger_entries" | python3 -c "import sys,json; print(json.load(sys.stdin)['rows'])"
