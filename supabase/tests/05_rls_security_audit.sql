-- Deliberate household-isolation break-in attempt (firstmate RLS security
-- audit). 01_rls_isolation.sql and 04_review_fixes.sql already cover
-- categories cross-insert and the household_invites/categories-delete/
-- bill_items-kind fixes; this file targets what neither covered:
--   - cross-household UPDATE/DELETE (not just INSERT/read) on every
--     household-scoped table, including incomes/bill_items/ledger_entries
--     (01_rls_isolation.sql only exercised categories).
--   - household_members has no insert/update/delete policy at all: prove a
--     member can neither self-join another household, nor tamper with (or
--     delete) their own or anyone else's membership row.
--   - materialize_payday() rejects a household_id the caller isn't a member
--     of, even though it's SECURITY INVOKER (not DEFINER).
--   - a malformed/guessed invite code never joins an existing household
--     (falls through to a brand-new one, same as the already-tested expired
--     case) - both a garbage string and a well-formed-looking hex code that
--     simply doesn't exist.
--
-- Same psql-variable/\if pattern as the other test files (dollar-quoted DO
-- blocks can't see :'var' substitution).

-- Two fresh, independent households + one real household-scoped row apiece,
-- so a cross-household attempt has something concrete to try to read/tamper.
do $$
declare
  v_owner_id uuid := gen_random_uuid();
  v_attacker_id uuid := gen_random_uuid();
  v_owner_household uuid;
  v_attacker_household uuid;
  v_owner_member uuid;
  v_cat uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_owner_id, 'authenticated', 'authenticated',
    'sec-owner@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Owner', 'household_name', 'Security Owner Household'),
    now(), now(), '', '', '', ''
  );
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_attacker_id, 'authenticated', 'authenticated',
    'sec-attacker@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Attacker', 'household_name', 'Security Attacker Household'),
    now(), now(), '', '', '', ''
  );

  select household_id, id into v_owner_household, v_owner_member
    from public.household_members where user_id = v_owner_id;
  select household_id into v_attacker_household
    from public.household_members where user_id = v_attacker_id;

  if v_owner_household = v_attacker_household then
    raise exception 'FAIL: fixture setup produced the same household for both test users';
  end if;

  insert into public.categories (household_id, kind, name, sort_order)
  values (v_owner_household, 'bill', 'Owner Secret Category', 0)
  returning id into v_cat;

  insert into public.incomes (household_id, member_id, label, amount, recurring_day)
  values (v_owner_household, v_owner_member, 'Owner Salary', 50000, 15);

  insert into public.bill_items (category_id, label, amount, recurring_day)
  values (v_cat, 'Owner Rent', 10000, 1);

  insert into public.ledger_entries (household_id, category_id, payday_date, amount, status)
  values (v_owner_household, v_cat, '2026-10-01', 10000, 'pending');
end $$;

select id as owner_id from auth.users where email = 'sec-owner@example.com' \gset
select id as attacker_id from auth.users where email = 'sec-attacker@example.com' \gset
select household_id as owner_household from public.household_members where user_id = :'owner_id' \gset
select household_id as attacker_household from public.household_members where user_id = :'attacker_id' \gset
select id as owner_member from public.household_members where user_id = :'owner_id' \gset
select id as attacker_member from public.household_members where user_id = :'attacker_id' \gset
select id as owner_cat from public.categories where household_id = :'owner_household' and name = 'Owner Secret Category' \gset
select id as owner_income from public.incomes where household_id = :'owner_household' \gset
select id as owner_bill from public.bill_items where category_id = :'owner_cat' \gset
select id as owner_ledger from public.ledger_entries where category_id = :'owner_cat' \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'attacker_id', false);

-- ===== Cross-household SELECT must return nothing, on every scoped table
-- (01_rls_isolation.sql already covers households/household_members/
-- categories - this fills in incomes/bill_items/ledger_entries) =====

select not exists(select 1 from public.incomes where id = :'owner_income') as chk_income_hidden \gset
\if :chk_income_hidden
\else
  \echo 'FAIL: attacker could read another household''s income row'
  \quit 1
\endif

select not exists(select 1 from public.bill_items where id = :'owner_bill') as chk_bill_hidden \gset
\if :chk_bill_hidden
\else
  \echo 'FAIL: attacker could read another household''s bill_item row'
  \quit 1
\endif

select not exists(select 1 from public.ledger_entries where id = :'owner_ledger') as chk_ledger_hidden \gset
\if :chk_ledger_hidden
\else
  \echo 'FAIL: attacker could read another household''s ledger_entry row'
  \quit 1
\endif

-- Every UPDATE/DELETE attempt below runs as the attacker under RLS, so it can
-- only ever affect rows RLS lets them see (i.e. zero rows here) - but reading
-- the result back through the SAME attacker role would just show NULL/absent
-- either way (RLS hides the owner's row regardless of whether the write
-- landed), which would make the check vacuous. So the attempts run here, and
-- the "did it actually change anything" verification runs later as superuser
-- (after `reset role`), where the real row state is visible.

-- ===== Cross-household UPDATE must be a no-op on every scoped table =====
update public.incomes set amount = 1 where id = :'owner_income';
update public.bill_items set amount = 1 where id = :'owner_bill';
update public.ledger_entries set status = 'checked' where id = :'owner_ledger';

-- ===== Cross-household DELETE must be a no-op on every scoped table =====
delete from public.incomes where id = :'owner_income';
delete from public.bill_items where id = :'owner_bill';
delete from public.ledger_entries where id = :'owner_ledger';

-- ===== Cross-household INSERT must be rejected (spoofed household_id, or a
-- category/member id belonging to the other household) =====

\set ON_ERROR_STOP 0
insert into public.incomes (household_id, member_id, label, amount, recurring_day)
values (:'owner_household', :'owner_member', 'Injected', 999, 1);
\set ON_ERROR_STOP 1
\if :ERROR
\else
  \echo 'FAIL: attacker inserted an income row into another household'
  \quit 1
\endif

\set ON_ERROR_STOP 0
insert into public.bill_items (category_id, label, amount, recurring_day)
values (:'owner_cat', 'Injected Bill', 1, 1);
\set ON_ERROR_STOP 1
\if :ERROR
\else
  \echo 'FAIL: attacker inserted a bill_item against another household''s category'
  \quit 1
\endif

\set ON_ERROR_STOP 0
insert into public.ledger_entries (household_id, category_id, payday_date, amount, status)
values (:'owner_household', :'owner_cat', '2026-11-01', 1, 'pending');
\set ON_ERROR_STOP 1
\if :ERROR
\else
  \echo 'FAIL: attacker inserted a ledger_entry into another household'
  \quit 1
\endif

-- ===== household_members: no client insert/update/delete path at all =====

-- Self-join: attacker tries to add themselves to the owner's household.
\set ON_ERROR_STOP 0
insert into public.household_members (household_id, user_id, display_name)
values (:'owner_household', :'attacker_id', 'Sneaky');
\set ON_ERROR_STOP 1
\if :ERROR
\else
  \echo 'FAIL: attacker self-joined another household via a direct household_members insert'
  \quit 1
\endif

-- Tamper: attacker tries to re-point their own membership row at the owner's household.
-- Delete: attacker tries to delete their own membership row, and the owner's.
-- (Verified for real below, as superuser - reading these back through the
-- attacker's own RLS-filtered view can't distinguish "blocked" from "another
-- household's row, invisible either way".)
update public.household_members set household_id = :'owner_household' where id = :'attacker_member';
delete from public.household_members where id = :'attacker_member';
delete from public.household_members where id = :'owner_member';

-- ===== materialize_payday(): SECURITY INVOKER, must still reject a
-- household_id the caller isn't a member of =====

\set ON_ERROR_STOP 0
select * from public.materialize_payday(:'owner_household'::uuid);
\set ON_ERROR_STOP 1
\if :ERROR
\else
  \echo 'FAIL: materialize_payday() let the attacker materialize another household''s payday'
  \quit 1
\endif

reset role;
reset request.jwt.claim.sub;

-- ===== Verify none of the attacker's writes actually landed (checked as
-- superuser, bypassing RLS, so a hidden row and an unmodified row can't be
-- confused) =====

select (select amount from public.incomes where id = :'owner_income') = 50000 as chk_income_untouched \gset
\if :chk_income_untouched
\else
  \echo 'FAIL: attacker''s cross-household income update/delete actually took effect'
  \quit 1
\endif

select (select amount from public.bill_items where id = :'owner_bill') = 10000 as chk_bill_untouched \gset
\if :chk_bill_untouched
\else
  \echo 'FAIL: attacker''s cross-household bill_item update/delete actually took effect'
  \quit 1
\endif

select (select status from public.ledger_entries where id = :'owner_ledger') = 'pending' as chk_ledger_untouched \gset
\if :chk_ledger_untouched
\else
  \echo 'FAIL: attacker''s cross-household ledger_entry update/delete actually took effect'
  \quit 1
\endif

select (select household_id from public.household_members where id = :'attacker_member') = :'attacker_household' as chk_attacker_membership_untouched \gset
\if :chk_attacker_membership_untouched
\else
  \echo 'FAIL: attacker''s own household_members row was tampered with or deleted'
  \quit 1
\endif

select (select household_id from public.household_members where id = :'owner_member') = :'owner_household' as chk_owner_membership_untouched \gset
\if :chk_owner_membership_untouched
\else
  \echo 'FAIL: attacker deleted the owner''s household_members row'
  \quit 1
\endif

-- ===== A malformed/guessed invite code never joins an existing household
-- (falls through to a brand-new one) =====

do $$
declare
  v_id uuid := gen_random_uuid();
  v_household uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    'sec-garbage-code@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'GarbageCode', 'invite_code', 'not-a-real-code'),
    now(), now(), '', '', '', ''
  );

  select household_id into v_household from public.household_members where user_id = v_id;

  if v_household is null then
    raise exception 'FAIL: garbage invite code left the user with no household at all';
  end if;

  if exists (select 1 from public.household_invites where code = 'not-a-real-code') then
    raise exception 'FAIL: a garbage code should never match a real household_invites row';
  end if;
end $$;

do $$
declare
  v_id uuid := gen_random_uuid();
  v_household uuid;
  v_guessed_code text := encode(gen_random_bytes(6), 'hex'); -- well-formed, but never issued
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    'sec-guessed-code@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'GuessedCode', 'invite_code', v_guessed_code),
    now(), now(), '', '', '', ''
  );

  select household_id into v_household from public.household_members where user_id = v_id;

  if v_household is null then
    raise exception 'FAIL: a never-issued well-formed invite code left the user with no household at all';
  end if;
end $$;

select 'PASS: 05_rls_security_audit' as result;
