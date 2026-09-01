#!/usr/bin/env bash
# Apply this prompt's rollbacks against a throwaway database, then re-apply.
# Does not touch vistrial_schema_test.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${VISTRIAL_ROLLBACK_DB:-vistrial_rollback_test}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)

sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true
sudo -u postgres dropdb --if-exists "${DB_NAME}"
sudo -u postgres createdb "${DB_NAME}"

run() {
  "${PSQL[@]}" -d "${DB_NAME}" -f "$1"
}

echo "Auth stub + all migrations on ${DB_NAME}..."
run "${ROOT}/supabase/tests/local-auth-stub.sql"
for f in "${ROOT}/supabase/migrations/"*.sql; do
  run "$f"
done

col_exists() {
  "${PSQL[@]}" -d "${DB_NAME}" -tAc \
    "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='ops_alerts' AND column_name='phase1_unused_pad'"
}

if [[ "$(col_exists | tr -d ' ')" != "0" ]]; then
  echo "phase1_unused_pad still present after forward migrations" >&2
  exit 1
fi

echo "Rollback phase-2 drop (column returns)..."
run "${ROOT}/supabase/rollbacks/20260825020000_drop_ops_alerts_phase1_pad.sql"
if [[ "$(col_exists | tr -d ' ')" != "1" ]]; then
  echo "phase-2 rollback did not restore the pad column" >&2
  exit 1
fi

echo "Re-apply phase-2 drop..."
run "${ROOT}/supabase/migrations/20260825020000_drop_ops_alerts_phase1_pad.sql"
if [[ "$(col_exists | tr -d ' ')" != "0" ]]; then
  echo "re-applied phase-2 drop left the column in place" >&2
  exit 1
fi

echo "Rollback production_hardening (tables gone)..."
run "${ROOT}/supabase/rollbacks/20260825010000_production_hardening.sql"
fn_exists="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='delete_org_data'")"
if [[ "$(echo "$fn_exists" | tr -d ' ')" != "0" ]]; then
  echo "rollback left delete_org_data in place" >&2
  exit 1
fi

echo "Re-apply hardening migrations..."
run "${ROOT}/supabase/migrations/20260825010000_production_hardening.sql"
run "${ROOT}/supabase/migrations/20260825020000_drop_ops_alerts_phase1_pad.sql"
fn_exists="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='delete_org_data'")"
if [[ "$(echo "$fn_exists" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore delete_org_data" >&2
  exit 1
fi

echo "OK: hardening migration rollback and re-apply succeeded."

echo "Rollback mobile in-the-moment (columns gone)..."
run "${ROOT}/supabase/rollbacks/20260825120000_mobile_in_the_moment.sql"
col_mobile="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='touches' AND column_name='client_event_id'")"
if [[ "$(echo "$col_mobile" | tr -d ' ')" != "0" ]]; then
  echo "mobile rollback left client_event_id in place" >&2
  exit 1
fi
fn_mobile="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='mark_mobile_training'")"
if [[ "$(echo "$fn_mobile" | tr -d ' ')" != "0" ]]; then
  echo "mobile rollback left mark_mobile_training in place" >&2
  exit 1
fi

echo "Re-apply mobile in-the-moment..."
run "${ROOT}/supabase/migrations/20260825120000_mobile_in_the_moment.sql"
col_mobile="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='touches' AND column_name='client_event_id'")"
if [[ "$(echo "$col_mobile" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore client_event_id" >&2
  exit 1
fi
fn_mobile="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='mark_mobile_training'")"
if [[ "$(echo "$fn_mobile" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore mark_mobile_training" >&2
  exit 1
fi

echo "OK: mobile migration rollback and re-apply succeeded."

echo "Rollback calibration (tables and holdout column gone)..."
run "${ROOT}/supabase/rollbacks/20260826010000_calibration.sql"
col_holdout="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='holdout_percent'")"
if [[ "$(echo "$col_holdout" | tr -d ' ')" != "0" ]]; then
  echo "calibration rollback left holdout_percent in place" >&2
  exit 1
fi
fn_cal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='load_calibration_report'")"
if [[ "$(echo "$fn_cal" | tr -d ' ')" != "0" ]]; then
  echo "calibration rollback left load_calibration_report in place" >&2
  exit 1
fi
tbl_cal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='calibration_suggestions'")"
if [[ "$(echo "$tbl_cal" | tr -d ' ')" != "0" ]]; then
  echo "calibration rollback left calibration_suggestions in place" >&2
  exit 1
fi

echo "Re-apply calibration..."
run "${ROOT}/supabase/migrations/20260826010000_calibration.sql"
col_holdout="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='holdout_percent'")"
if [[ "$(echo "$col_holdout" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore holdout_percent" >&2
  exit 1
fi
fn_cal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='load_calibration_report'")"
if [[ "$(echo "$fn_cal" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore load_calibration_report" >&2
  exit 1
fi
tbl_cal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='calibration_suggestions'")"
if [[ "$(echo "$tbl_cal" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore calibration_suggestions" >&2
  exit 1
fi

echo "OK: calibration migration rollback and re-apply succeeded."

echo "Rollback call quality (tables and embargo column gone)..."
run "${ROOT}/supabase/rollbacks/20260827010000_call_quality.sql"
col_embargo="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='call_coaching_embargo_hours'")"
if [[ "$(echo "$col_embargo" | tr -d ' ')" != "0" ]]; then
  echo "call quality rollback left call_coaching_embargo_hours in place" >&2
  exit 1
fi
fn_cq="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='load_call_quality_rep_snapshot'")"
if [[ "$(echo "$fn_cq" | tr -d ' ')" != "0" ]]; then
  echo "call quality rollback left load_call_quality_rep_snapshot in place" >&2
  exit 1
fi
tbl_cq="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='call_quality_measures'")"
if [[ "$(echo "$tbl_cq" | tr -d ' ')" != "0" ]]; then
  echo "call quality rollback left call_quality_measures in place" >&2
  exit 1
fi

echo "Re-apply call quality..."
run "${ROOT}/supabase/migrations/20260827010000_call_quality.sql"
col_embargo="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='call_coaching_embargo_hours'")"
if [[ "$(echo "$col_embargo" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore call_coaching_embargo_hours" >&2
  exit 1
fi
fn_cq="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='load_call_quality_rep_snapshot'")"
if [[ "$(echo "$fn_cq" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore load_call_quality_rep_snapshot" >&2
  exit 1
fi
tbl_cq="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='call_quality_measures'")"
if [[ "$(echo "$tbl_cq" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore call_quality_measures" >&2
  exit 1
fi

echo "OK: call quality migration rollback and re-apply succeeded."

echo "Rollback operator agent (tables and batch cap gone)..."
run "${ROOT}/supabase/rollbacks/20260828010000_operator_agent.sql"
col_cap="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='operator_agent_batch_cap'")"
if [[ "$(echo "$col_cap" | tr -d ' ')" != "0" ]]; then
  echo "operator agent rollback left operator_agent_batch_cap in place" >&2
  exit 1
fi
tbl_oa="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='operator_runs'")"
if [[ "$(echo "$tbl_oa" | tr -d ' ')" != "0" ]]; then
  echo "operator agent rollback left operator_runs in place" >&2
  exit 1
fi
fn_oa="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='consume_operator_agent_rate_limit'")"
if [[ "$(echo "$fn_oa" | tr -d ' ')" != "0" ]]; then
  echo "operator agent rollback left consume_operator_agent_rate_limit in place" >&2
  exit 1
fi

echo "Re-apply operator agent..."
run "${ROOT}/supabase/migrations/20260828010000_operator_agent.sql"
col_cap="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='operator_agent_batch_cap'")"
if [[ "$(echo "$col_cap" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore operator_agent_batch_cap" >&2
  exit 1
fi
tbl_oa="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='operator_runs'")"
if [[ "$(echo "$tbl_oa" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore operator_runs" >&2
  exit 1
fi
fn_oa="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='consume_operator_agent_rate_limit'")"
if [[ "$(echo "$fn_oa" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore consume_operator_agent_rate_limit" >&2
  exit 1
fi

echo "OK: operator agent migration rollback and re-apply succeeded."

echo "Re-apply self-verification after operator-agent table recreate..."
run "${ROOT}/supabase/migrations/20260830010000_self_verification.sql"

echo "Rollback self-verification (tables and columns gone)..."
run "${ROOT}/supabase/rollbacks/20260830010000_self_verification.sql"
col_sv="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='call_extractions' AND column_name='verification_status'")"
if [[ "$(echo "$col_sv" | tr -d ' ')" != "0" ]]; then
  echo "self-verification rollback left verification_status in place" >&2
  exit 1
fi
tbl_sv="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='verification_runs'")"
if [[ "$(echo "$tbl_sv" | tr -d ' ')" != "0" ]]; then
  echo "self-verification rollback left verification_runs in place" >&2
  exit 1
fi
fn_sv="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reporting_recompute_outcome'")"
if [[ "$(echo "$fn_sv" | tr -d ' ')" != "0" ]]; then
  echo "self-verification rollback left reporting_recompute_outcome in place" >&2
  exit 1
fi

echo "Re-apply self-verification..."
run "${ROOT}/supabase/migrations/20260830010000_self_verification.sql"
col_sv="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='call_extractions' AND column_name='verification_status'")"
if [[ "$(echo "$col_sv" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore verification_status" >&2
  exit 1
fi
tbl_sv="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='verification_runs'")"
if [[ "$(echo "$tbl_sv" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore verification_runs" >&2
  exit 1
fi
fn_sv="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reporting_recompute_outcome'")"
if [[ "$(echo "$fn_sv" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore reporting_recompute_outcome" >&2
  exit 1
fi

echo "OK: self-verification migration rollback and re-apply succeeded."

echo "Rollback activity stream (derived RPCs and history tables gone)..."
run "${ROOT}/supabase/rollbacks/20260831010000_activity_stream.sql"
fn_act="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='load_org_activity'")"
if [[ "$(echo "$fn_act" | tr -d ' ')" != "0" ]]; then
  echo "activity rollback left load_org_activity in place" >&2
  exit 1
fi
tbl_act="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='lead_assignment_changes'")"
if [[ "$(echo "$tbl_act" | tr -d ' ')" != "0" ]]; then
  echo "activity rollback left lead_assignment_changes in place" >&2
  exit 1
fi
col_act="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='follow_up_events' AND column_name='lead_id'")"
if [[ "$(echo "$col_act" | tr -d ' ')" != "0" ]]; then
  echo "activity rollback left follow_up_events.lead_id in place" >&2
  exit 1
fi

echo "Re-apply activity stream..."
run "${ROOT}/supabase/migrations/20260831010000_activity_stream.sql"
fn_act="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='load_org_activity'")"
if [[ "$(echo "$fn_act" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore load_org_activity" >&2
  exit 1
fi
tbl_act="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='lead_assignment_changes'")"
if [[ "$(echo "$tbl_act" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore lead_assignment_changes" >&2
  exit 1
fi
col_act="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='follow_up_events' AND column_name='lead_id'")"
if [[ "$(echo "$col_act" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore follow_up_events.lead_id" >&2
  exit 1
fi

echo "OK: activity stream migration rollback and re-apply succeeded."

echo "Rollback owner portal (tables, RPCs, and surface_access gone)..."
run "${ROOT}/supabase/rollbacks/20260832010000_owner_portal.sql"
fn_portal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='portal_adoption'")"
if [[ "$(echo "$fn_portal" | tr -d ' ')" != "0" ]]; then
  echo "owner portal rollback left portal_adoption in place" >&2
  exit 1
fi
tbl_portal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='source_connections'")"
if [[ "$(echo "$tbl_portal" | tr -d ' ')" != "0" ]]; then
  echo "owner portal rollback left source_connections in place" >&2
  exit 1
fi
col_portal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='has_net_close'")"
if [[ "$(echo "$col_portal" | tr -d ' ')" != "0" ]]; then
  echo "owner portal rollback left leads.has_net_close in place" >&2
  exit 1
fi
col_surface="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='org_members' AND column_name='surface_access'")"
if [[ "$(echo "$col_surface" | tr -d ' ')" != "0" ]]; then
  echo "owner portal rollback left org_members.surface_access in place" >&2
  exit 1
fi

echo "Re-apply owner portal..."
run "${ROOT}/supabase/migrations/20260832010000_owner_portal.sql"
fn_portal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='portal_adoption'")"
if [[ "$(echo "$fn_portal" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore portal_adoption" >&2
  exit 1
fi
tbl_portal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='source_connections'")"
if [[ "$(echo "$tbl_portal" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore source_connections" >&2
  exit 1
fi
col_portal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='has_net_close'")"
if [[ "$(echo "$col_portal" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore leads.has_net_close" >&2
  exit 1
fi
col_surface="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='org_members' AND column_name='surface_access'")"
if [[ "$(echo "$col_surface" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore org_members.surface_access" >&2
  exit 1
fi

echo "OK: owner portal migration rollback and re-apply succeeded."

echo "Rollback agent framework (tables and wrap gone)..."
run "${ROOT}/supabase/rollbacks/20260834010000_agent_framework.sql"
tbl_agent="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='agent_runs'")"
if [[ "$(echo "$tbl_agent" | tr -d ' ')" != "0" ]]; then
  echo "agent framework rollback left agent_runs in place" >&2
  exit 1
fi
fn_v21="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='activity_stream_source_v21'")"
if [[ "$(echo "$fn_v21" | tr -d ' ')" != "0" ]]; then
  echo "agent framework rollback left activity_stream_source_v21 in place" >&2
  exit 1
fi

echo "Re-apply agent framework..."
run "${ROOT}/supabase/migrations/20260834010000_agent_framework.sql"
tbl_agent="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='agent_runs'")"
if [[ "$(echo "$tbl_agent" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore agent_runs" >&2
  exit 1
fi
fn_src="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='activity_stream_source'")"
if [[ "$(echo "$fn_src" | tr -d ' ')" = "0" ]]; then
  echo "re-apply did not restore activity_stream_source" >&2
  exit 1
fi

echo "OK: agent framework migration rollback and re-apply succeeded."

# Newest first: forsight_sync_runs holds a column of the type the foundation
# rollback drops, so live sources has to come off before the foundation can.
echo "Rollback forsight live sources (ghl type and sync log gone)..."
run "${ROOT}/supabase/rollbacks/20260836010000_forsight_live_sources.sql"
tbl_runs="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='forsight_sync_runs'")"
if [[ "$(echo "$tbl_runs" | tr -d ' ')" != "0" ]]; then
  echo "forsight live sources rollback left forsight_sync_runs in place" >&2
  exit 1
fi
enum_ghl="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='forsight_source_type' AND e.enumlabel='ghl'")"
if [[ "$(echo "$enum_ghl" | tr -d ' ')" != "0" ]]; then
  echo "forsight live sources rollback left the ghl source type in place" >&2
  exit 1
fi

echo "Rollback forsight foundation (sources table and type gone)..."
run "${ROOT}/supabase/rollbacks/20260835010000_forsight_foundation.sql"
tbl_forsight="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='forsight_sources'")"
if [[ "$(echo "$tbl_forsight" | tr -d ' ')" != "0" ]]; then
  echo "forsight rollback left forsight_sources in place" >&2
  exit 1
fi
type_forsight="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='forsight_source_type'")"
if [[ "$(echo "$type_forsight" | tr -d ' ')" != "0" ]]; then
  echo "forsight rollback left forsight_source_type in place" >&2
  exit 1
fi

echo "Re-apply forsight foundation..."
run "${ROOT}/supabase/migrations/20260835010000_forsight_foundation.sql"
tbl_forsight="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='forsight_sources'")"
if [[ "$(echo "$tbl_forsight" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore forsight_sources" >&2
  exit 1
fi

echo "OK: forsight foundation migration rollback and re-apply succeeded."

echo "Re-apply forsight live sources..."
run "${ROOT}/supabase/migrations/20260836010000_forsight_live_sources.sql"
tbl_runs="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='forsight_sync_runs'")"
if [[ "$(echo "$tbl_runs" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore forsight_sync_runs" >&2
  exit 1
fi
col_cal="$("${PSQL[@]}" -d "${DB_NAME}" -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='forsight_sources' AND column_name='ghl_calendar_id'")"
if [[ "$(echo "$col_cal" | tr -d ' ')" != "1" ]]; then
  echo "re-apply did not restore ghl_calendar_id" >&2
  exit 1
fi

echo "OK: forsight live sources migration rollback and re-apply succeeded."
