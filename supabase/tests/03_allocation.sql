-- Verifies materialize_payday's output against hand-computed values
-- reproducing taiwan-fund-planner.html's math on the seeded numbers
-- (firstmate spec, Tests item c).
--
-- Original file, 10-month window starting Oct 2026 (index 0): INCOME=58000,
-- EXPENSES_TOTAL=29240, DEBT_TOTAL=[13820,5620,2620,...], PINATUBO all 0 in
-- this window (no Pinatubo trip in this seed), TAIWAN water-fill (:365-391)
-- over 5 months gives TAIWAN=[14940,8140,18973,18973,18974], and for month
-- index 2 (Dec 2026): remainder=26140-18973=7167, EMERGENCY=2150 (30%,
-- uncapped), SAVINGS=3584 (50%), EXCESS=1433 (20%+residual). Per-payday
-- weights that month (leftoverBase, :458-459) are [10380,6500,5760,3500] for
-- paydays [5,15,20,30], and allocateProportional (:433-450) onto the 20th
-- (index 3) gives TAIWAN=4181 (4180 here, see below), EMERGENCY=474,
-- SAVINGS=790, EXCESS=316 — see docs/plan.md and the PR description for the
-- full hand computation.
--
-- Note: psql does not interpolate :'var' inside DO $$ ... $$ bodies, so the
-- assertion block below looks values up itself (via auth.uid(), which is a
-- plain SQL/plpgsql runtime call, not a psql variable) instead of receiving
-- them from outside.

select household_id as hid from public.household_members
  where user_id = (select id from auth.users where email = 'leo@example.com') \gset
select id as taiwan_id from public.categories where household_id = :'hid' and name = 'Taiwan Fund' \gset
select id as leo_id from auth.users where email = 'leo@example.com' \gset

-- Prior months' Taiwan-fund history, checked off, building the running
-- balance the goal tier reads (docs/plan.md §1's "balance" design call):
-- Oct 2026 contributes 14940, Nov 2026 contributes 8140 (both fully
-- cushion-constrained months per the water-fill trace above).
insert into public.ledger_entries (category_id, payday_date, amount, status, checked_at)
values
  (:'taiwan_id', '2026-10-20', 14940, 'checked', now()),
  (:'taiwan_id', '2026-11-20', 8140, 'checked', now());

set role authenticated;
select set_config('request.jwt.claim.sub', :'leo_id', false);

select count(*) as materialized_count from public.materialize_payday(:'hid', '2026-12-20');

do $$
declare
  v_household_id uuid;
  v_taiwan_id uuid;
  v_emergency_id uuid;
  v_savings_id uuid;
  v_excess_id uuid;
  v_taiwan numeric;
  v_emergency numeric;
  v_savings numeric;
  v_excess numeric;
  v_bill_total numeric;
  v_row_count int;
begin
  select household_id into v_household_id from public.household_members where user_id = auth.uid();
  select id into v_taiwan_id from public.categories where household_id = v_household_id and name = 'Taiwan Fund';
  select id into v_emergency_id from public.categories where household_id = v_household_id and name = 'Emergency Fund';
  select id into v_savings_id from public.categories where household_id = v_household_id and name = 'Savings';
  select id into v_excess_id from public.categories where household_id = v_household_id and name = 'Excess';

  select amount into v_taiwan from public.ledger_entries
    where category_id = v_taiwan_id and payday_date = '2026-12-20' and bill_item_id is null;
  select amount into v_emergency from public.ledger_entries
    where category_id = v_emergency_id and payday_date = '2026-12-20' and bill_item_id is null;
  select amount into v_savings from public.ledger_entries
    where category_id = v_savings_id and payday_date = '2026-12-20' and bill_item_id is null;
  select amount into v_excess from public.ledger_entries
    where category_id = v_excess_id and payday_date = '2026-12-20' and bill_item_id is null;

  -- The original's 4181: its per-fund rounding put this payday's funds ₱1
  -- over its 5760 cushion; since 20260923000020 the largest fund absorbs it.
  if v_taiwan is distinct from 4180 then
    raise exception 'FAIL: Taiwan Fund allocation for 2026-12-20 was %, expected 4180', v_taiwan;
  end if;
  if v_emergency is distinct from 474 then
    raise exception 'FAIL: Emergency Fund allocation for 2026-12-20 was %, expected 474', v_emergency;
  end if;
  if v_savings is distinct from 790 then
    raise exception 'FAIL: Savings allocation for 2026-12-20 was %, expected 790', v_savings;
  end if;
  if v_excess is distinct from 316 then
    raise exception 'FAIL: Excess allocation for 2026-12-20 was %, expected 316', v_excess;
  end if;

  -- 4180+474+790+316: exactly this payday's own cushion (its share of the
  -- month's 7167 leftover, weighted by that cushion - the month total is
  -- split across all 4 paydays).
  if v_taiwan + v_emergency + v_savings + v_excess <> 5760 then
    raise exception 'FAIL: fund allocations for 2026-12-20 sum to %, expected 5760',
      v_taiwan + v_emergency + v_savings + v_excess;
  end if;

  -- Bill/debt line items due the 20th (taiwan-fund-planner.html:324-341,347):
  -- 8 expense items totaling 11620, plus the Nano debt installment (2620).
  select coalesce(sum(amount), 0) into v_bill_total
  from public.ledger_entries
  where payday_date = '2026-12-20' and bill_item_id is not null;

  if v_bill_total <> 14240 then
    raise exception 'FAIL: bill/debt ledger total for 2026-12-20 was %, expected 14240', v_bill_total;
  end if;

  select count(*) into v_row_count from public.ledger_entries where payday_date = '2026-12-20';
  if v_row_count <> 13 then
    raise exception 'FAIL: expected 13 ledger_entries rows for 2026-12-20 (4 funds + 9 bill/debt items), got %', v_row_count;
  end if;
end $$;

-- Idempotency: materializing the same payday again must not duplicate rows.
select count(*) from public.materialize_payday(:'hid', '2026-12-20');

do $$
declare
  v_row_count int;
begin
  select count(*) into v_row_count from public.ledger_entries where payday_date = '2026-12-20';
  if v_row_count <> 13 then
    raise exception 'FAIL: re-materializing the same payday should not duplicate rows, got % rows', v_row_count;
  end if;
end $$;

reset role;
reset request.jwt.claim.sub;

select 'PASS: 03_allocation' as result;
