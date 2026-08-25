#!/usr/bin/env bash
# Full restore into a clean database. A backup that has never been restored
# is not a backup. This is the drill the operations dashboard timestamps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DB="${VISTRIAL_RESTORE_SRC_DB:-vistrial_restore_source}"
DST_DB="${VISTRIAL_RESTORE_DST_DB:-vistrial_restore_target}"
DUMP="${TMPDIR:-/tmp}/vistrial-restore-drill.dump"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)
OUT_JSON="${ROOT}/docs/operations/restore-drill-last.json"

sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true

echo "Building source database ${SRC_DB}..."
sudo -u postgres dropdb --if-exists "${SRC_DB}"
sudo -u postgres createdb "${SRC_DB}"
"${PSQL[@]}" -d "${SRC_DB}" -f "${ROOT}/supabase/tests/local-auth-stub.sql" >/dev/null
for f in "${ROOT}/supabase/migrations/"*.sql; do
  "${PSQL[@]}" -d "${SRC_DB}" -f "$f" >/dev/null
done
"${PSQL[@]}" -d "${SRC_DB}" -f "${ROOT}/supabase/seed.sql" >/dev/null

count_sql="
SELECT jsonb_build_object(
  'organizations', (SELECT count(*) FROM public.organizations),
  'leads', (SELECT count(*) FROM public.leads),
  'touches', (SELECT count(*) FROM public.touches),
  'calls', (SELECT count(*) FROM public.calls),
  'call_extractions', (SELECT count(*) FROM public.call_extractions),
  'objections', (SELECT count(*) FROM public.objections),
  'readiness_scores', (SELECT count(*) FROM public.readiness_scores),
  'revenue_log', (SELECT count(*) FROM public.revenue_log),
  'baseline_leads', (SELECT count(*) FROM public.baseline_leads),
  'baseline_touches', (SELECT count(*) FROM public.baseline_touches),
  'baseline_calls', (SELECT count(*) FROM public.baseline_calls),
  'baseline_revenue', (SELECT count(*) FROM public.baseline_revenue)
);
"

src_counts="$("${PSQL[@]}" -d "${SRC_DB}" -tAc "$count_sql")"

echo "Dumping ${SRC_DB}..."
sudo -u postgres pg_dump -Fc --schema=public --schema=auth "${SRC_DB}" > "${DUMP}"

echo "Restoring into clean ${DST_DB}..."
sudo -u postgres dropdb --if-exists "${DST_DB}"
sudo -u postgres createdb "${DST_DB}"

start_ns="$(date +%s%N)"
sudo -u postgres pg_restore --dbname="${DST_DB}" --no-owner --exit-on-error "${DUMP}"
end_ns="$(date +%s%N)"
duration_ms="$(( (end_ns - start_ns) / 1000000 ))"

dst_counts="$("${PSQL[@]}" -d "${DST_DB}" -tAc "$count_sql")"

fk_broken="$("${PSQL[@]}" -d "${DST_DB}" -tAc "
SELECT count(*) FROM (
  SELECT conrelid::regclass AS tbl
  FROM pg_constraint
  WHERE contype = 'f'
    AND connamespace = 'public'::regnamespace
    AND NOT convalidated
) s;
")"

if [[ "${src_counts}" != "${dst_counts}" ]]; then
  echo "Restore counts differ." >&2
  echo "source: ${src_counts}" >&2
  echo "target: ${dst_counts}" >&2
  exit 1
fi

if [[ "$(echo "${fk_broken}" | tr -d ' ')" != "0" ]]; then
  echo "Restore left unvalidated foreign keys." >&2
  exit 1
fi

# Lead → call → extraction relationship from seed, if present.
rel_ok="$("${PSQL[@]}" -d "${DST_DB}" -tAc "
SELECT CASE WHEN count(*) = (
  SELECT count(*) FROM public.call_extractions e
  JOIN public.calls c ON c.id = e.call_id AND c.org_id = e.org_id
  JOIN public.leads l ON l.id = c.lead_id AND l.org_id = c.org_id
) THEN 1 ELSE 0 END
FROM public.call_extractions;
")"

mkdir -p "$(dirname "${OUT_JSON}")"
python3 - <<PY
import json, os, datetime
payload = {
  "performedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "durationMs": int("${duration_ms}"),
  "sourceDb": "${SRC_DB}",
  "targetDb": "${DST_DB}",
  "verified": True,
  "counts": json.loads('''${dst_counts}'''),
  "relationshipsIntact": bool(int("${rel_ok}".strip() or "0")),
  "rpoMinutesDocumented": 1440,
  "rpoMinutesWithPitr": 5,
  "notes": "Local pg_dump/pg_restore drill. Hosted production uses Supabase PITR (30 days) in addition to this procedure.",
}
path = "${OUT_JSON}"
with open(path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2)
    fh.write("\n")
print(json.dumps(payload, indent=2))
PY

rm -f "${DUMP}"
echo "OK: restore drill completed in ${duration_ms}ms."
