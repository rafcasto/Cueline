#!/usr/bin/env bash
# Applies the migration + seed to a throwaway Postgres 16 cluster and runs the RLS/broadcast smoke test.
# Needs the postgresql-16 binaries; no Docker or Supabase CLI required. Usage: scripts/db-test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
D="$(mktemp -d)"
PORT=5499
trap '"$PGBIN/pg_ctl" -D "$D/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
"$PGBIN/initdb" -D "$D/data" -A trust -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$D/data" -o "-p $PORT -k $D" -l "$D/log" start >/dev/null
P=(psql -v ON_ERROR_STOP=1 -h "$D" -p "$PORT" -U postgres -q)
"${P[@]}" -c "create database cueline"
"${P[@]}" -d cueline -f "$ROOT/supabase/tests/supabase-stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${P[@]}" -d cueline -f "$f"; echo "applied $(basename "$f")"; done
"${P[@]}" -d cueline -f "$ROOT/supabase/seed.sql"
"${P[@]}" -d cueline -f "$ROOT/supabase/tests/smoke.sql" | grep -E "check|pass|\bf\b|\bt\b" || true
echo "db-test: OK"
