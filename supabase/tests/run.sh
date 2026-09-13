#!/usr/bin/env bash
# Applies every migration + seed.sql + this directory's SQL tests against a
# throwaway local Postgres cluster, then tears it down.
#
# This is NOT `supabase start` (the real local stack needs Docker, which
# isn't available in this sandbox) — it's a plain Postgres 16 instance with a
# minimal auth schema stub (supabase/tests/support/stub_auth.sql) standing in
# for the parts of the Supabase platform that live outside this repo's
# migrations. The migrations themselves are ordinary Supabase-CLI SQL and run
# unmodified against the real `supabase start`/hosted stack too.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_PREFIX="$(brew --prefix postgresql@16 2>/dev/null || echo /opt/homebrew/opt/postgresql@16)"
export PATH="$PG_PREFIX/bin:$PATH"

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/taiwan-expenses-pgtest.XXXXXX")"
DATA="$WORKDIR/data"
PORT=54329

cleanup() {
  pg_ctl -D "$DATA" -o "-p $PORT -k $WORKDIR -c listen_addresses=''" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

initdb -D "$DATA" -U "$(whoami)" -A trust >/dev/null
pg_ctl -D "$DATA" -l "$WORKDIR/postgres.log" \
  -o "-p $PORT -k $WORKDIR -c listen_addresses=''" start

PSQL_OPTS=(-h "$WORKDIR" -p "$PORT" -v ON_ERROR_STOP=1 -X -q)
createdb -h "$WORKDIR" -p "$PORT" taiwan_expenses_test

run() { psql "${PSQL_OPTS[@]}" -d taiwan_expenses_test -f "$1"; }

run "$ROOT/supabase/tests/support/stub_auth.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "== migration: $(basename "$f")"
  run "$f"
done

echo "== seed.sql"
run "$ROOT/supabase/seed.sql"

for f in "$ROOT"/supabase/tests/0*.sql; do
  echo "== test: $(basename "$f")"
  run "$f"
done

echo "ALL TESTS PASSED"
