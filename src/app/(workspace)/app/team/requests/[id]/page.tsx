import Link from "next/link";
import { notFound } from "next/navigation";

import { HelpThread, type HelpReplyView, type HelpRequestView } from "@/app/(workspace)/app/help/help-thread";
import { StaffReplyForm } from "@/app/(workspace)/app/team/requests/request-forms";
import { PageFrame } from "@/components/app/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireStaff } from "@/lib/auth/gates";
import { portalDb } from "@/lib/metrics/load";
import { HELP_STATUS, HELP_TOPICS, type HelpTopic } from "@/lib/portal/requests";

export const dynamic = "force-dynamic";

export const metadata = { title: "Help request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TeamHelpRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireStaff();
  const db = await portalDb();
  const [{ data: request }, { data: replies }, { data: org }] = await Promise.all([
    db
      .from("help_requests")
      .select("id, org_id, topic, message, status, page_path, lead_id, created_by_name, created_at")
      .eq("id", id)
      .maybeSingle(),
    db.from("help_replies").select("id, author_name, from_team, body, created_at").eq("request_id", id).order("created_at"),
    db.from("help_requests").select("org_id, organizations(name)").eq("id", id).maybeSingle(),
  ]);
  if (!request) notFound();
  const row = request as HelpRequestView;
  const status = HELP_STATUS[row.status] ?? HELP_STATUS.received!;
  const named = org as { organizations: { name: string } | { name: string }[] | null } | null;
  const workspace = Array.isArray(named?.organizations) ? named?.organizations[0]?.name : named?.organizations?.name;

  return (
    <PageFrame
      title={HELP_TOPICS[row.topic as HelpTopic] ?? HELP_TOPICS.general}
      description={[workspace, row.page_path ? `from ${row.page_path}` : null].filter(Boolean).join(" · ") || undefined}
      actions={<StatusBadge label={status.label} tone={status.tone} />}
    >
      <HelpThread request={row} replies={(replies ?? []) as HelpReplyView[]} />
      <StaffReplyForm requestId={row.id} status={row.status} />
      <Link href="/app/team/requests" className="text-sm text-brand-300 underline">
        All requests
      </Link>
    </PageFrame>
  );
}
