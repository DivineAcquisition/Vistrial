import { redirect } from "next/navigation";

import { requireReportingAccess } from "@/lib/reporting/access";
import { loadReportingState } from "@/lib/reporting/load";
import { parseReportingRange, reportingRangeQuery } from "@/lib/reporting/range";

export default async function ReportingClientRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireReportingAccess();
  const params = await searchParams;
  const meta = await loadReportingState(ctx.org.id);
  const activatedAt = typeof meta.activated_at === "string" ? meta.activated_at : null;
  const range = parseReportingRange(params, activatedAt);
  const query = reportingRangeQuery(range);
  redirect(query ? `/portal?${query}` : "/portal");
}
