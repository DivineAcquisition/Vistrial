#!/usr/bin/env bash
# The configuration migration against existing data, the way live will meet it:
#   1. every migration before 20261007030000, then the seed and a live-like workspace;
#   2. apply 20261007030000 and prove each workspace behaves as before (parity);
#   3. roll back and re-apply, twice, proving the legacy rows return exactly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${CONFIG_MIGRATION_TEST_DB:-vistrial_config_migration_test}"
TARGET=20261007030000_configuration_system.sql
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
run() { "${PSQL[@]}" < "$1" > /dev/null; }

sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1 || true
sudo -u postgres createdb "$DB"
run "$ROOT/supabase/tests/local-auth-stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  [ "$(basename "$f")" = "$TARGET" ] && break
  run "$f"
done
run "$ROOT/supabase/seed.sql"
run "$ROOT/supabase/tests/config-migration-fixture.sql"

legacy_rows() {
  "${PSQL[@]}" -At -c "
    SELECT md5(string_agg(r, '|' ORDER BY r)) FROM (
      SELECT 's' || (to_jsonb(x) - 'updated_at')::text AS r FROM public.score_configs x
      UNION ALL SELECT 'f' || (to_jsonb(x) - 'updated_at')::text FROM public.follow_up_settings x
      UNION ALL SELECT 'v' || (to_jsonb(x) - 'updated_at')::text FROM public.org_voice_profiles x
      UNION ALL SELECT 'g' || (to_jsonb(x) - 'updated_at' - 'created_at')::text FROM public.approval_gate_settings x
      UNION ALL SELECT 'a' || (to_jsonb(x) - 'updated_at' - 'created_at')::text FROM public.approval_gate_actions x
      UNION ALL SELECT 'o' || jsonb_build_object('tz', timezone, 'ws', working_hours_start, 'we', working_hours_end, 'wd', working_days,
        'tr', transcript_retention_days, 'cn', owner_contact_name, 'ce', owner_contact_email, 'cp', owner_contact_phone)::text
      FROM public.organizations
    ) rows"
}
BEFORE="$(legacy_rows)"

echo "Applying $TARGET to a database with existing workspaces..."
run "$ROOT/supabase/migrations/$TARGET"
"${PSQL[@]}" -At < "$ROOT/supabase/tests/config-migration-parity.sql" | tail -1

for round in 1 2; do
  echo "Round $round: roll back..."
  run "$ROOT/supabase/rollbacks/$TARGET"
  AFTER="$(legacy_rows)"
  if [ "$AFTER" != "$BEFORE" ]; then
    echo "FAIL: legacy settings rows differ after rollback round $round"; exit 1
  fi
  if [ "$("${PSQL[@]}" -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'config\_%'")" != "0" ]; then
    echo "FAIL: configuration tables remain after rollback"; exit 1
  fi
  echo "Round $round: re-apply..."
  run "$ROOT/supabase/migrations/$TARGET"
  "${PSQL[@]}" -At < "$ROOT/supabase/tests/config-migration-parity.sql" | tail -1
done
echo "OK: configuration migration keeps every workspace's behaviour, and rolls back cleanly twice."

RUNTIME=20261007040000_configuration_runtime.sql
echo "Runtime migration ($RUNTIME): apply, roll back keeping opt-outs, re-apply..."
run "$ROOT/supabase/migrations/$RUNTIME"
"${PSQL[@]}" -q -c "INSERT INTO public.lead_opt_outs (lead_id, org_id, word) SELECT id, org_id, 'STOP' FROM public.leads LIMIT 1" >/dev/null
run "$ROOT/supabase/rollbacks/$RUNTIME"
if [ "$("${PSQL[@]}" -At -c "SELECT count(*) FROM vistrial_rollback_keep.lead_opt_outs")" != "1" ]; then
  echo "FAIL: the runtime rollback did not keep the recorded opt-outs"; exit 1
fi
run "$ROOT/supabase/migrations/$RUNTIME"
"${PSQL[@]}" -At < "$ROOT/supabase/tests/config-migration-parity.sql" | tail -1
echo "OK: runtime migration rolls back and re-applies cleanly."
