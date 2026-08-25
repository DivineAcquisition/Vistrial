import { runAuthorizedCron } from "@/lib/ops/jobs";
import { deleteOrgsPastGrace } from "@/lib/ops/lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  return runAuthorizedCron(request, "retention", async (db) => {
    const { data: preview, error } = await db.rpc("run_data_retention", { p_dry_run: dryRun });
    if (error) throw new Error(error.message);
    let deletedOrgs = 0;
    if (!dryRun) {
      deletedOrgs = await deleteOrgsPastGrace(db);
    }
    return { retention: preview, deletedOrgs, dryRun };
  });
}
