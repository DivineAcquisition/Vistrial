#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB_NAME="${VISTRIAL_TEST_DB:-vistrial_schema_test}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)

echo "Starting PostgreSQL if needed..."
sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true

echo "Recreating ${DB_NAME}..."
sudo -u postgres dropdb --if-exists "${DB_NAME}"
sudo -u postgres createdb "${DB_NAME}"

run() {
  "${PSQL[@]}" -d "${DB_NAME}" -f "$1"
}

echo "Auth stub..."
run "${ROOT}/supabase/tests/local-auth-stub.sql"

echo "Migration..."
run "${ROOT}/supabase/migrations/20260817040000_case_file_spine.sql"

echo "RLS enabled on all twelve tables?"
"${PSQL[@]}" -d "${DB_NAME}" -c "
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'organizations','org_members','score_configs','leads','readiness_scores',
    'touches','calls','call_extractions','objections','next_actions',
    'revenue_log','webhook_events'
  )
ORDER BY 1;
"

echo "Seed..."
run "${ROOT}/supabase/seed.sql"

echo "Constraint + trigger checks..."
run "${ROOT}/supabase/tests/verify-constraints.sql"

echo "RLS checks..."
run "${ROOT}/supabase/tests/verify-rls.sql"

echo "OK: schema, seed, triggers, and RLS checks passed."
