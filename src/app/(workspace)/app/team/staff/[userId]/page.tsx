import Link from "next/link";
import { notFound } from "next/navigation";

import { HandoverForm } from "@/app/(workspace)/app/team/staff/[userId]/form";
import { PageFrame } from "@/components/app/page-frame";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { staffDb } from "@/lib/staff/db";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function HandoverPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!UUID.test(userId)) notFound();
  const ctx = await requirePlatformAdmin();
  if (userId === ctx.user.id) notFound();
  const db = await staffDb();
  const [{ data: person }, { data: work }, { data: staff }] = await Promise.all([
    db.from("platform_staff").select("user_id, display_name, active").eq("user_id", userId).maybeSingle(),
    db.rpc("staff_open_work", { p_user_id: userId }),
    db.from("platform_staff").select("user_id, display_name").eq("active", true).order("display_name"),
  ]);
  const row = person as { display_name: string; active: boolean } | null;
  if (!row?.active) notFound();
  const open = (work ?? {}) as { workspaces?: Array<{ org_id: string; name: string }>; requests?: number; escalations?: number; data_requests?: number };
  const people = ((staff ?? []) as Array<{ user_id: string; display_name: string }>).filter((item) => item.user_id !== userId);
  return (
    <PageFrame
      title={`Hand over ${row.display_name}`}
      description="Their workspaces and open items move to the person you choose. A workspace with nobody chosen stays with Platform Admins and shows as unassigned."
    >
      <p className={helperClass}>
        {open.requests ?? 0} requests, {open.escalations ?? 0} escalations, {open.data_requests ?? 0} data requests.
      </p>
      <HandoverForm userId={userId} workspaces={open.workspaces ?? []} people={people} />
      <Link href="/app/team/staff" className="text-sm text-brand-300 underline">
        Back to staff
      </Link>
    </PageFrame>
  );
}
