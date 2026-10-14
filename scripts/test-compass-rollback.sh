#!/usr/bin/env bash
# Compass rollback round trip: every migration, roll Compass back, check it is
# gone and the replaced functions are back, then re-apply it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${VISTRIAL_COMPASS_ROLLBACK_DB:-vistrial_compass_rollback_test}"
PSQL=(sudo -u postgres psql -q -v ON_ERROR_STOP=1)

sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true
sudo -u postgres dropdb --if-exists "${DB_NAME}"
sudo -u postgres createdb "${DB_NAME}"

run() {
  "${PSQL[@]}" -d "${DB_NAME}" -f "$1" >/dev/null
}
scalar() {
  "${PSQL[@]}" -d "${DB_NAME}" -tAc "$1" | tr -d ' '
}

run "${ROOT}/supabase/tests/local-auth-stub.sql"
for f in "${ROOT}/supabase/migrations/"*.sql; do
  run "$f"
done

echo "Rollback Compass..."
run "${ROOT}/supabase/rollbacks/20261014010000_compass.sql"
if [[ "$(scalar "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'compass\_%' OR tablename = 'help_articles')")" != "0" ]]; then
  echo "rollback left Compass tables in place" >&2
  exit 1
fi
if [[ "$(scalar "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='org_members' AND column_name='can_see_transcripts'")" != "0" ]]; then
  echo "rollback left the transcript permission column" >&2
  exit 1
fi
if [[ "$(scalar "SELECT count(*) FROM pg_proc WHERE proname LIKE 'compass\_%' AND pronamespace='public'::regnamespace")" != "0" ]]; then
  echo "rollback left Compass functions" >&2
  exit 1
fi
if [[ "$(scalar "SELECT count(*) FROM pg_proc WHERE proname='sales_os_conversation_visible' AND pg_get_functiondef(oid) LIKE '%ws_is_staff%'")" == "0" ]] \
   && [[ "$(scalar "SELECT count(*) FROM pg_proc WHERE proname='sales_os_conversation_visible'")" != "1" ]]; then
  echo "rollback did not put back sales_os_conversation_visible" >&2
  exit 1
fi

echo "Re-apply Compass..."
run "${ROOT}/supabase/migrations/20261014010000_compass.sql"
if [[ "$(scalar "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='compass_conversations'")" != "1" ]]; then
  echo "re-apply did not create Compass tables" >&2
  exit 1
fi

sudo -u postgres dropdb --if-exists "${DB_NAME}"
echo "OK: Compass rollback and re-apply succeeded."
