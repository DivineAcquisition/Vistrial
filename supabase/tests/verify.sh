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
    'lead_status_changes','transcript_connections','unmatched_transcripts',
    'extraction_jobs','extraction_corrections','extraction_usage','brief_openings',
    'follow_up_settings','org_voice_profiles','follow_up_routing_rules',
    'follow_up_sequence_runs','follow_up_jobs','follow_up_drafts',
    'follow_up_quality_check_failures','follow_up_events','follow_up_reply_signals',
    'voice_profile_suggestions','baseline_runs','baseline_leads','baseline_touches',
    'baseline_calls','baseline_revenue','self_reported_baselines','reporting_job_runs',
    'reporting_snapshots','reporting_cohorts','business_profiles','business_profile_versions',
    'business_profile_stages','profile_field_registry','profile_review_prompts',
    'profile_contradictions','objection_vocabulary','org_benchmark_metrics','benchmark_cohorts',
    'configuration_priors','leak_reports','activation_records','activation_changes',
    'baseline_fallback_declines',    'notifications','notification_preferences',
    'notification_mutes','notification_escalations','notification_presence',
    'notification_push_subscriptions','notification_team_channels','notification_digest_log',
    'rate_limit_buckets','ops_job_catalog','ops_job_runs','ops_alerts','ops_http_errors',
    'ops_health_samples','ops_incidents','ops_restore_drills','retention_runs',
    'org_deletion_records'
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

echo "Transcript checks..."
run "${ROOT}/supabase/tests/verify-transcripts.sql"

echo "Follow-up checks..."
run "${ROOT}/supabase/tests/verify-follow-up.sql"

echo "Integrity checks..."
run "${ROOT}/supabase/tests/verify-integrity.sql"

echo "Reporting checks..."
run "${ROOT}/supabase/tests/verify-reporting.sql"

echo "Business profile checks..."
run "${ROOT}/supabase/tests/verify-business-profile.sql"

echo "Onboarding reconcile checks..."
run "${ROOT}/supabase/tests/verify-onboarding-reconcile.sql"

echo "Notification checks..."
run "${ROOT}/supabase/tests/verify-notifications.sql"

echo "Hardening checks..."
run "${ROOT}/supabase/tests/verify-hardening.sql"

echo "Mobile in-the-moment checks..."
run "${ROOT}/supabase/tests/verify-mobile.sql"

echo "Migration rollback (this prompt's migrations)..."
bash "${ROOT}/scripts/test-migration-rollback.sh"

echo "OK: schema, seed, triggers, RLS, invite, scoring, GHL, platform-admin, queue, case-file, transcript, follow-up, integrity, reporting, business-profile, onboarding-reconcile, notification, hardening, and mobile checks passed."
