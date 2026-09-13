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
- Every function sets `set search_path = ''`, so any extension-provided function (`gen_random_bytes`, etc.) called inside one must be schema-qualified as `extensions.<fn>` — see `supabase/tests/support/stub_auth.sql` for why the test stub mirrors a real project's `extensions` schema.
- The `goal` rule tier is balance-adaptive (reads actual `checked` ledger totals each call), not a precomputed static multi-month plan like the original HTML — a deliberate generalization so the plan reacts to what was actually saved. `remaining_periods` for a goal counts months up to (not including) the target month, matching the original's "one month of safety margin" framing.

## Frontend (Expo/React Native)

Scaffolded fresh at the repo root (`src/app` = Expo Router routes, `src/components/ui` = design-system primitives, `src/theme`, `src/lib`). Screens/design language come from `docs/plan.md` §3 and the design system export at `/Users/leo/Downloads/Taiwan Fund Planner Design System` (outside this repo) — see that package's `readme.md` for the token/component rationale.

- **Database types are hand-written** (`src/lib/database.types.ts`) — no Docker/local Supabase in this sandbox to run `supabase gen types typescript`. Regenerate that file for real once a local or real project is reachable.
- **Row/Insert/Update in `database.types.ts` must be `type` aliases, not `interface` declarations.** `@supabase/postgrest-js`'s select-query-parser resolves `.select()` projections (even a plain `'*'`) to `never` when a table's Row type is an interface reference — same shape, only `interface` vs `type` differs. Verified against the installed postgrest-js version; if types.ts errors mysteriously come back as `never`, check this first.
- **Theming:** three runtime-switchable themes (`original`/`warm`/`playful`, warm default) live in `src/theme/tokens.ts`, applied via NativeWind's `vars()` in `src/theme/ThemeProvider.tsx`. `var(--x)` strings only resolve through NativeWind's `className` processing — never pass them to a raw RN `style` prop or a third-party native component (e.g. `react-native-svg`); use `useTheme().vars['--x']` (the resolved hex) for those instead.
- **Styling stack is NativeWind v4 + Tailwind v3** (`tailwindcss@^3.4.17`), not gluestack-ui and not Tailwind v4 — `docs/techspec.md`'s version table paired incompatible versions (NativeWind v4 only targets Tailwind v3; gluestack-ui's current major has moved to a v5/NativeWind-v5/Tailwind-v4 preview line). Design-system components (Button, Callout, Checklist*, etc.) are hand-built in `src/components/ui/` rather than pulled from a component library.
- **Realtime is intentionally not wired** — `docs/techspec.md` §3 recommends plain refetch (TanStack Query, no `postgres_changes` subscription) for a 2-user household; this was flagged as an open question, not a decision, despite other framings of the task claiming otherwise.
- **No Docker in this sandbox** — data-layer code is written and typechecked against the real schema/migrations but has not been run against a live Supabase instance (local or cloud). `.env.example` documents the `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` vars; point them at a local `supabase start` stack or a real project once one exists.
- **Android emulator works in this sandbox** (`~/Library/Android/sdk`, AVD `Pixel_7a`) once its data partition is large enough — the default 6G AVD disk hits `INSTALL_FAILED_INSUFFICIENT_STORAGE` installing Expo Go; bumped to 10G in `~/.android/avd/Pixel_7a.avd/config.ini` (`disk.dataPartition.size`) with `-wipe-data` on relaunch. `npx expo start --android` (use `CI=1`, not `--non-interactive`, to avoid a prompt) then installs Expo Go and bundles/launches the app — confirmed working end-to-end (verified via `adb screencap`), though only against the onboarding screen since no backend is live yet.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
