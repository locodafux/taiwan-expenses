-- Verifies RLS actually blocks a user from seeing/writing another
-- household's data (firstmate spec, Tests item a).
--
-- Note: psql does not interpolate :'var' inside DO $$ ... $$ bodies (it
-- treats dollar-quoted text as opaque), so this file only ever passes psql
-- variables through top-level SQL statements, and uses \if to assert.

-- A second, unrelated household + user, to test isolation against.
do $$
declare
  v_stranger_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_stranger_id, 'authenticated', 'authenticated',
    'stranger@example.com', crypt('password123', gen_salt('bf')), now(),
    now(), now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', 'Stranger', 'household_name', 'Stranger Household'),
    now(), now(), '', '', '', ''
  );
end $$;

select id as leo_id from auth.users where email = 'leo@example.com' \gset
select household_id as stranger_household from public.household_members
  where user_id = (select id from auth.users where email = 'stranger@example.com') \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'leo_id', false);

select (select count(*) from public.households) = 1 as chk_households \gset
select (select count(*) from public.household_members) = 2 as chk_members \gset
select (select count(*) from public.categories) = 6 as chk_categories \gset
select not exists (select 1 from public.households where id = :'stranger_household') as chk_no_household \gset
select not exists (select 1 from public.household_members where household_id = :'stranger_household') as chk_no_members \gset

\if :chk_households
\else
  \echo 'FAIL: expected Leo to see exactly 1 household'
  \quit 1
\endif
\if :chk_members
\else
  \echo 'FAIL: expected Leo to see exactly 2 household_members (Leo+Ann)'
  \quit 1
\endif
\if :chk_categories
\else
  \echo 'FAIL: expected Leo to see exactly 6 categories from his own household'
  \quit 1
\endif
\if :chk_no_household
\else
  \echo 'FAIL: Leo should not be able to see the stranger''s household row'
  \quit 1
\endif
\if :chk_no_members
\else
  \echo 'FAIL: Leo should not be able to see the stranger''s household_members rows'
  \quit 1
\endif

-- Cross-household insert must be rejected by RLS (42501 insufficient_privilege).
\set ON_ERROR_STOP 0
insert into public.categories (household_id, kind, name, sort_order)
values (:'stranger_household', 'bill', 'Hack', 0);
\set ON_ERROR_STOP 1

\if :ERROR
\else
  \echo 'FAIL: inserting a category into another household should have been rejected by RLS'
  \quit 1
\endif

select (:'SQLSTATE' = '42501') as chk_sqlstate \gset
\if :chk_sqlstate
\else
  \echo 'FAIL: cross-household insert failed, but not with RLS''s 42501 insufficient_privilege'
  \quit 1
\endif

reset role;
reset request.jwt.claim.sub;

select 'PASS: 01_rls_isolation' as result;
