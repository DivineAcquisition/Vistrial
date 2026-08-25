import { evaluateAndNotifyAlerts } from "@/lib/ops/alerts";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "ops-health", async (db) => {
    const { error: healthError } = await db.from("organizations").select("id").limit(1);
    const { data: runtime } = await db.rpc("sample_db_runtime");
    await db.from("ops_health_samples").insert({
      app_ok: true,
      db_ok: !healthError,
      detail: { source: "ops-health", runtime: runtime ?? null },
    });
    const alerts = await evaluateAndNotifyAlerts(db);
    return { ok: true, dbOk: !healthError, runtime, alerts };
  });
}
