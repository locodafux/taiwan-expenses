-- Test-only fixture: stands in for the parts of Supabase's platform-managed
-- `auth` schema and `anon`/`authenticated`/`service_role` roles that a real
-- Supabase project (local `supabase start` stack or hosted) already provides
-- outside of this repo's migrations. NOT part of the shipped schema — used
-- only by supabase/tests/run.sh against a plain local Postgres, because this
-- sandbox has no Docker to run the real local stack.

-- Real Supabase projects pre-provision the `extensions` schema and put it on
-- the default search_path, so pgcrypto/uuid-ossp resolve unqualified in
-- table defaults but a SECURITY DEFINER function's `set search_path = ''`
-- still needs `extensions.<fn>` qualification. Mirror that here.
create schema extensions;
alter database taiwan_expenses_test set search_path = "$user", public, extensions;
create extension if not exists pgcrypto with schema extensions;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant authenticated to current_user;
grant anon to current_user;

create schema auth;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  recovery_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  confirmation_token text,
  email_change text,
  email_change_token_new text,
  recovery_token text
);

-- Mirrors Supabase's real auth.uid(): read the authenticated request's JWT
-- "sub" claim out of a GUC that PostgREST sets per-request.
create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

-- Supabase's platform grants these on every table/sequence created in
-- `public` by default; RLS policies are what actually restrict rows.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant select on tables to anon;
grant usage on schema public to anon, authenticated, service_role;

-- Every real Supabase project pre-provisions this publication; migrations
-- only ever `alter publication ... add table` onto it (see
-- 20260913000005_realtime.sql). A plain Postgres cluster has no publication
-- at all yet, so that migration would otherwise fail with
-- "publication \"supabase_realtime\" does not exist" before any test runs.
create publication supabase_realtime;
