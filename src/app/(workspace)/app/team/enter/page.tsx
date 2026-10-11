import Link from "next/link";

import { EnterForm } from "@/app/(workspace)/app/team/enter/enter-form";
import { PageFrame } from "@/components/app/page-frame";
import { requireStaff } from "@/lib/auth/gates";
import { SESSION_END_REASON } from "@/lib/staff/copy";
import { safeInternalPath } from "@/lib/auth/paths";

export const dynamic = "force-dynamic";

export const metadata = { title: "Enter workspace" };

export default async function EnterWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireStaff();
  const params = await searchParams;
  const orgId = typeof params.org === "string" ? params.org : "";
  const reason = typeof params.reason === "string" ? params.reason : "none";
  const next = safeInternalPath(typeof params.next === "string" ? params.next : "/app/home", "/app/home");
  const target = ctx.memberships.find((membership) => membership.orgId === orgId);

  return (
    <PageFrame
      title={target ? target.org.name : "Workspace"}
      description="Entering is recorded. The visit lasts at most an hour, and ends after 30 minutes with nothing happening. The Owner can see that you were here."
    >
      {reason !== "none" && SESSION_END_REASON[reason] ? (
        <p className="text-sm text-muted-foreground">{SESSION_END_REASON[reason]} Re-entering is a new visit.</p>
      ) : null}
      {target ? (
        <EnterForm orgId={orgId} next={next} />
      ) : (
        <p className="text-sm text-muted-foreground">
          That workspace is not open to you. <Link href="/app/team/roster" className="text-brand-300 underline">Back to the roster</Link>
        </p>
      )}
    </PageFrame>
  );
}
