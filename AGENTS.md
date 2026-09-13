# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Supabase backend

Schema/RLS/allocation-engine spec lives in `docs/plan.md` and `docs/techspec.md` (already reviewed/approved); the original algorithm being reproduced is `taiwan-fund-planner.html`'s `allocateProportional`/`fundAllocation` (search that file for the line-number references cited in migration comments).

- Migrations: `supabase/migrations/*.sql`, applied in filename order. Schema → RLS (`private.user_household_ids()` SECURITY DEFINER pattern) → onboarding (signup/invite trigger) → allocation engine (`public.materialize_payday`).
- `household_id` is denormalized onto `bill_items`/`incomes`/`ledger_entries` via BEFORE INSERT triggers (populated from the parent category/member, overwriting whatever the client sent) so every household-scoped table shares one flat RLS predicate.
- `household_members` has deliberately no client insert/update/delete policy — membership is only ever created by the SECURITY DEFINER `handle_new_user` trigger on `auth.users` (direct signup or invite redemption via `raw_user_meta_data->>'invite_code'`). Don't add a naive `user_id = auth.uid()` insert policy here — it would let any signed-in user self-join any household by guessing its id.
- `supabase/tests/run.sh` runs the SQL test suite against a **plain local Postgres** (Homebrew `postgresql@16`), not the real `supabase start` Docker stack — this sandbox has no Docker. `supabase/tests/support/stub_auth.sql` stands in for the platform-managed `auth` schema/roles. The migrations themselves are ordinary Supabase-CLI SQL and should run unmodified under a real `supabase start`/`db push` once Docker is available. If Docker becomes available, prefer running `supabase test db` against the real stack instead of this stub.
- psql does not interpolate `:'var'` inside `DO $$ ... $$` bodies (dollar-quoted text is opaque to it) — tests pass values in via `\gset`/`\if` at the top level, or have the DO block look values up itself (e.g. via `auth.uid()`).
- The `goal` rule tier is balance-adaptive (reads actual `checked` ledger totals each call), not a precomputed static multi-month plan like the original HTML — a deliberate generalization so the plan reacts to what was actually saved. `remaining_periods` for a goal counts months up to (not including) the target month, matching the original's "one month of safety margin" framing.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
