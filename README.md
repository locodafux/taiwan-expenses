# Taiwan Fund Planner

A couple's shared household finance and fund-allocation planner, built as an Expo/React
Native app on top of Supabase. Both partners sign in (email/password or Google) to the same
household, pool their paydays, and split each payday's leftover cash proportionally across
savings categories — bills, debt, goals, and general funds — with a live checklist to mark
off as amounts are actually set aside.

This began as a single-file HTML tool (`taiwan-fund-planner.html`, kept for reference) hardcoded
to one person's specific 2026–2027 budget. It has since been rebuilt into a general-purpose,
multi-user app; the original file no longer reflects how the app works today.

## Stack

- **Frontend**: Expo (React Native) + Expo Router, styled with NativeWind v4 (Tailwind v3)
- **Backend**: Supabase (Postgres, Auth, Realtime), with RLS enforcing per-household data
  isolation
- **State/data**: TanStack Query, synced live via Supabase Realtime subscriptions

## Features

- **Households & invites**: sign up to create a new household, or join an existing one via an
  invite code. Household membership and name are manageable from Settings.
- **Shared incomes**: each member's paydays and take-home amounts are recorded per household.
- **Categories with proportional allocation**: configurable savings/expense categories, each
  using one of three rule types — *goal* (balance-adaptive target by a date), *capped-percent*,
  or *remainder* — reproducing the original tool's proportional payday-split math generically.
  Categories can be archived.
- **Bill items**: recurring per-category expense items.
- **Payday checklist**: a per-payday checklist of bills, debts, and fund contributions; checking
  an item posts a real ledger transaction (not just a toggle) and updates that category's running
  balance.
- **Dashboard**: household overview, including a saved-this-quarter stat and a payday streak
  chip.
- **Goal celebrations**: a one-time, cross-device notification when a goal category is fully
  funded.
- **Realtime sync**: changes made by either partner (categories, incomes, bill items, ledger
  entries, membership) sync live to the other's device.
- **Switchable themes**: three runtime-switchable UI themes (`original`, `warm`, `playful`),
  set per-user in Settings.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project's URL and anon key
   (`supabase status` for a local `supabase start` stack, or Project Settings → API for a
   real project).
3. If you're pointing at a fresh Supabase project, link it and apply the schema:
   `supabase link --project-ref <ref>` then `supabase db push` (applies everything in
   `supabase/migrations/`, in filename order).
4. Start the app: `npx expo start` (or `--android` / `--ios`; see `AGENTS.md` for the
   `--web` caveat and other environment-specific notes).

See `AGENTS.md` for architecture notes, migration/RLS details, and sharp edges discovered
during development. See `docs/plan.md` and `docs/techspec.md` for the original design/tech
spec this build was based on.
