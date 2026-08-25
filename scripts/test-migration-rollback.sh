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
