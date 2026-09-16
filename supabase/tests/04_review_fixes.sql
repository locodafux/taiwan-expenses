-- Exercises the three round-1 review fixes as live client-facing behavior:
--   1. household_invites can no longer be INSERTed directly by a client
--      (only create_household_invite(), SECURITY DEFINER, may create one).
--   2. categories DELETE is allowed for a household member and cascades into
--      dependent ledger_entries/bill_items (captain's explicit call, see
--      20260916000001_categories_delete.sql — the client UI is responsible
--      for warning before deleting a category with existing history).
--   3. bill_items.category_id must reference a kind='bill' category.
--
-- Same psql-variable/\if pattern as 01_rls_isolation.sql (dollar-quoted DO
-- blocks can't see :'var' substitution).

select id as leo_id from auth.users where email = 'leo@example.com' \gset
select household_id from public.household_members
  where user_id = :'leo_id' \gset
select id as expenses_cat from public.categories
  where household_id = :'household_id' and name = 'Expenses' \gset
select id as taiwan_cat from public.categories
  where household_id = :'household_id' and name = 'Taiwan Fund' \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'leo_id', false);

-- (1) Direct client INSERT into household_invites must be rejected by RLS.
\set ON_ERROR_STOP 0
insert into public.household_invites (household_id, code, created_by, expires_at)
values (:'household_id', 'guessable', :'leo_id', now() + interval '7 days');
\set ON_ERROR_STOP 1

\if :ERROR
\else
  \echo 'FAIL: client insert into household_invites should have been rejected'
  \quit 1
\endif

select (:'SQLSTATE' = '42501') as chk_invite_sqlstate \gset
\if :chk_invite_sqlstate
\else
  \echo 'FAIL: household_invites insert failed, but not with 42501 insufficient_privilege'
  \quit 1
\endif

-- (2) A household member can DELETE their own category, and it cascades
-- into that category's ledger_entries/bill_items history.
delete from public.categories where id = :'expenses_cat';

select exists(select 1 from public.categories where id = :'expenses_cat') as chk_category_still_there \gset
\if :chk_category_still_there
  \echo 'FAIL: categories DELETE should have removed the row, but it still exists'
  \quit 1
\endif

select exists(select 1 from public.ledger_entries where category_id = :'expenses_cat') as chk_ledger_still_there \gset
\if :chk_ledger_still_there
  \echo 'FAIL: deleting a category should cascade-delete its ledger_entries, but some remain'
  \quit 1
\endif

-- (3) A bill_item cannot attach to a fund-kind category.
\set ON_ERROR_STOP 0
insert into public.bill_items (category_id, label, amount, recurring_day)
values (:'taiwan_cat', 'Should be rejected', 100, 1);
\set ON_ERROR_STOP 1

\if :ERROR
\else
  \echo 'FAIL: inserting a bill_item against a fund-kind category should have been rejected'
  \quit 1
\endif

-- create_household_invite() RPC must still work for a household member —
-- it's now the *only* sanctioned way to create an invite. Run last so the
-- three checks above have already printed their own evidence even if this
-- one fails.
select code from public.create_household_invite() \gset rpc_

reset role;
reset request.jwt.claim.sub;

select 'PASS: 04_review_fixes' as result;
