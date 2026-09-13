# Taiwan Fund Planner

A single-page budgeting tool for one specific Philippine-peso income/expense/debt schedule, running October 2026 through July 17, 2027. It's built for whoever owns that plan (the repo owner) to see, at a glance, how much of every payday's leftover cash should go toward bills, debt, a Taiwan savings goal, a "Pinatubo trip" fund, an emergency fund, general savings, and whatever's left over — plus a checklist to tick off as each payday's amounts actually get set aside.

## How to use it

There's no install or server. Just open `taiwan-fund-planner.html` directly in a web browser (double-click it, or drag it into a browser window). Everything — layout, styling, and logic — is self-contained in that one file, with no build step and no external dependencies besides a Google Fonts stylesheet.

The page has two tabs:
- **Overview** — the final totals by end-of-plan, and a full month-by-month table.
- **Monthly breakdown** — a calendar for the selected month, per-month fund tiles, and a checklist of every item (expenses, debt, fund contributions) grouped by payday, with a progress bar.

## Data model (in brief)

All figures are hardcoded in the HTML/JS itself:

- **Paydays**: four fixed paydays per month — the 5th, 15th, 20th, and 30th — each with its own fixed take-home amount.
- **Expense items**: a fixed list of recurring monthly expenses (rent, utilities, food, transport fares, subscriptions, etc.), each tagged with the specific payday it's paid from.
- **Debt items by month**: a per-month list of debts owed (e.g. Macbook, Atome, Shopee, Nano), also tagged by payday, which shrinks over time as debts get paid off.
- **Fund categories**: a Taiwan fund (goal ₱80,000, spread across the first several months), a one-time Pinatubo trip fund (₱15,000, due before a fixed date), an emergency fund (capped at ₱100,000), general savings, and "excess" (whatever's left after everything else).
- **Proportional allocation rule**: for each month, after expenses and debt are assigned to their paydays, whatever's left over per payday is used as a weight — a payday with more cushion after its own bills and debt gets a proportionally larger share of that month's fund contributions, and a payday running tight (or negative) gets none.

Checklist state (which items are checked off) is saved via the browser's `localStorage`.

## Current limitations

- **No editing UI.** All numbers — income, expenses, debts, fund targets — are hardcoded in the HTML/JS. Changing anything requires editing the file directly.
- **Local-only persistence.** Checklist progress is saved only via `localStorage` in the browser it was checked in. It does not sync across browsers or devices, and it's lost if browser data is cleared.

## Roadmap (future ideas, not committed work)

- Deploy it live (e.g. on Vercel's free tier) so it's reachable at a URL instead of only as a local file.
- Make it installable on Android as a PWA.
- Add real persistent, synced data storage in place of `localStorage`.
- Potentially generalize it into a broader personal-finance app built around this same idea.

## Planned rework

The captain has approved a plan to rebuild this as a full-stack couple's finance app. This is **plan-stage only** — no app code exists yet, and everything above still describes how the tool works today. A separate build task will implement the following:

- **React Native (Expo) mobile app**, installable on Android, backed by Supabase's free tier (Postgres + Auth + Storage + Realtime) instead of a static HTML file with `localStorage`.
- **Shared household budget**: two people's incomes pool into one budget. Each person signs in separately (including Google sign-in) but both see and edit the same shared data.
- **Fully editable categories**: expenses, savings, the Taiwan fund, etc. become configurable in-app instead of hardcoded, using three rule types — *goal*, *capped-percent*, and *remainder* — matching the same proportional payday-split math this tool uses today.
- **Real ledger transactions**: checking off an item posts an actual transaction and builds that category's running balance over time, instead of just toggling a saved checkbox.
- **Three switchable UI themes**: an evolution of the original palette, a warm couple-oriented theme, and a bold playful-fintech look (the default).
