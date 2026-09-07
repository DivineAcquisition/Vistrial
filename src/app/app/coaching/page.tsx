import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { CoachingView } from "@/app/app/coaching/view";
import { getAuthContext } from "@/lib/auth/session";
import { loadCallQualityRepSnapshotForOrg } from "@/lib/coaching/load";
import { assertProductScope } from "@/lib/product-scope-guard";

export default async function CoachingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  assertProductScope("coaching");
  const ctx = await getAuthContext();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const includeTeam = params.compare === "team";
  const payload = await loadCallQualityRepSnapshotForOrg(ctx.org.id, {
    query: query || null,
    includeTeam,
  });

  return (
    <PageFrame
      title="Coaching"
      description="What your calls actually look like, in this business. Not a grade, and not a ranking."
    >
      <CoachingView payload={payload} query={query} includeTeam={includeTeam} />
      {ctx.role === "owner" || ctx.role === "admin" ? (
        <p className="mt-6 text-xs text-dim">
          <Link href="/app/reporting/coaching" className="underline-offset-2 hover:underline">
            Team coaching view
          </Link>
        </p>
      ) : null}
    </PageFrame>
  );
}
