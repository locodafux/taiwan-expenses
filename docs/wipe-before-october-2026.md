# Wipe of pre-October 2026 data (run 2026-09-29)

Captain's call: history starts on 2026-10-01, every fund starts at 0 (no opening-balance rows).

- **Script:** `scripts/wipe-before-october-2026.sh` (ran against the live project `oxnzczubwjoviyddajge`).
- **Targeted:** `public.ledger_entries` rows with `payday_date < 2026-10-01`, in every household (test households included). This is the only date-keyed history table; fund balances, goal progress and streaks are all derived from these rows, so nothing else needed resetting.
- **Deleted (31 rows):** Our household 15, Casa Timkang 11 (incl. 4 manual fund deposits), QA Household 3, Crewmate Household 2.
- **Left alone:** the 17 ledger rows dated 2026-10-01 or later (checksum identical before/after), households, members, categories (incl. `goal_celebrated_at`), incomes, bill items (incl. the retired SLOAN loan), chat, feedback.
- **Verified afterwards (live DB):** 0 rows before October remain; checked balance of both real households is 0; row counts of all other tables unchanged. October rows for the real households get created by `materialize_payday` on next app open.
- **Backup:** `/Users/leo/dev-tools/firstmate/data/taiwan-expenses-wipe-september-backup/` (one JSON file per public table, taken just before the delete; kept outside the repo).
- No app code changed, so no APK rebuild.
