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

echo "Migrations..."
for f in "${ROOT}/supabase/migrations/"*.sql; do
  echo "  $(basename "$f")"
  run "$f"
done

echo "RLS enabled on scoring and case-file tables?"
"${PSQL[@]}" -d "${DB_NAME}" -c "
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'organizations','org_members','org_invites','score_configs','score_field_maps',
    'score_field_rules','leads','readiness_scores','touches','calls','call_extractions',
    'objections','next_actions','revenue_log','webhook_events','ghost_detector_runs',
    'ghl_connections','ghl_oauth_sessions','ghl_field_maps','ghl_dispatches',
    'ghl_rate_windows','ghl_contact_locks','ingestion_alerts','platform_admins',
    'lead_status_changes'
  )
ORDER BY 1;
"

echo "Seed..."
run "${ROOT}/supabase/seed.sql"

echo "Constraint + trigger checks..."
run "${ROOT}/supabase/tests/verify-constraints.sql"

echo "RLS checks..."
run "${ROOT}/supabase/tests/verify-rls.sql"

echo "Invite checks..."
run "${ROOT}/supabase/tests/verify-invites.sql"

echo "Scoring checks..."
run "${ROOT}/supabase/tests/verify-scoring.sql"

echo "GHL ingest checks..."
run "${ROOT}/supabase/tests/verify-ghl.sql"

echo "Platform admin checks..."
run "${ROOT}/supabase/tests/verify-platform-admin.sql"

echo "Queue checks..."
run "${ROOT}/supabase/tests/verify-queue.sql"

echo "Case file checks..."
run "${ROOT}/supabase/tests/verify-case-files.sql"

echo "OK: schema, seed, triggers, RLS, invite, scoring, GHL, platform-admin, queue, and case-file checks passed."
