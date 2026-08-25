import type { GhlDb } from "@/lib/ghl/tokens";
import { opsAlertWebhookUrl } from "@/lib/ops/env";

export async function notifyDaAlert(payload: {
  kind: string;
  title: string;
  checkFirst: string;
  severity: string;
  orgId?: string | null;
  detail?: unknown;
}): Promise<void> {
  const url = opsAlertWebhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        destination: "da",
        ...payload,
      }),
    });
  } catch {
    // Alert delivery must not throw into the health job.
  }
}

export async function evaluateAndNotifyAlerts(db: GhlDb) {
  const { data, error } = await db.rpc("evaluate_ops_alerts");
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { openFingerprints?: string[] };
  const fingerprints = Array.isArray(result.openFingerprints) ? result.openFingerprints : [];
  if (fingerprints.length === 0) return data;

  const { data: rows } = await db
    .from("ops_alerts")
    .select("fingerprint, kind, title, check_first, severity, org_id, fired_at")
    .in("fingerprint", fingerprints)
    .is("resolved_at", null);

  const now = Date.now();
  for (const row of rows ?? []) {
    const ageMs = now - new Date(row.fired_at).getTime();
    if (ageMs > 3 * 60 * 1000) continue;
    await notifyDaAlert({
      kind: row.kind,
      title: row.title,
      checkFirst: row.check_first,
      severity: row.severity,
      orgId: row.org_id,
    });
  }
  return data;
}

export async function recordHttpSample(db: GhlDb, route: string, isError: boolean) {
  await db.rpc("record_ops_http_sample", { p_route: route, p_is_error: isError });
}
