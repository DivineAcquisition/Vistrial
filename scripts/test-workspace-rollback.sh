#!/usr/bin/env bash
# Round-trip 20261007020000_workspace_isolation on a throwaway database:
# forward, seed, rollback, forward, rollback, forward. Checks that the rollback
# restores platform_admins as a table, removes the workspace tables, keeps a
# copy of the activity log, and that the migration re-applies cleanly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${VISTRIAL_WORKSPACE_ROLLBACK_DB:-vistrial_workspace_rollback_test}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -q)
FORWARD="${ROOT}/supabase/migrations/20261007020000_workspace_isolation.sql"
ROLLBACK="${ROOT}/supabase/rollbacks/20261007020000_workspace_isolation.sql"

sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true
sudo -u postgres dropdb --if-exists "${DB_NAME}"
sudo -u postgres createdb "${DB_NAME}"

run() { "${PSQL[@]}" -d "${DB_NAME}" -f "$1" >/dev/null; }
q() { "${PSQL[@]}" -d "${DB_NAME}" -tAc "$1" | tr -d ' '; }
fail() { echo "$1" >&2; exit 1; }

echo "Auth stub + all migrations + seed on ${DB_NAME}..."
run "${ROOT}/supabase/tests/local-auth-stub.sql"
for f in "${ROOT}/supabase/migrations/"*.sql; do run "$f"; done
run "${ROOT}/supabase/seed.sql"

for round in 1 2; do
  echo "Round ${round}: rollback..."
  run "${ROLLBACK}"
  [[ "$(q "SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='platform_admins'")" == "r" ]] \
    || fail "rollback did not restore platform_admins as a table"
  [[ "$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('platform_staff','workspace_assignments','workspace_activity_log','inbound_event_holds')")" == "0" ]] \
    || fail "rollback left workspace tables in place"
  [[ "$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='vistrial_rollback_keep' AND c.relname LIKE 'workspace_activity_log_%'")" != "0" ]] \
    || fail "rollback did not keep a copy of the activity log"
  [[ "$(q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='org_members' AND column_name='seat'")" == "0" ]] \
    || fail "rollback left org_members.seat"

  echo "Round ${round}: re-apply..."
  run "${FORWARD}"
  [[ "$(q "SELECT relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='platform_admins'")" == "v" ]] \
    || fail "re-applied migration did not turn platform_admins into a view"
  [[ "$(q "SELECT count(*) FROM org_members WHERE seat='staff' AND role <> 'admin'")" == "0" ]] \
    || fail "re-applied migration left a staff seat with a customer role"
done

echo "OK: workspace isolation rollback and re-apply succeeded twice."
