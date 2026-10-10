import Link from "next/link";
import { notFound } from "next/navigation";

import { CloseRequestButton, FollowUpForm } from "@/app/(workspace)/app/help/help-forms";
import { HelpThread, type HelpReplyView, type HelpRequestView } from "@/app/(workspace)/app/help/help-thread";
import { PageFrame } from "@/components/app/page-frame";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAuthContext } from "@/lib/auth/session";
import { portalDb } from "@/lib/metrics/load";
import { HELP_STATUS, HELP_TOPICS } from "@/lib/portal/requests";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Help request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One request and the conversation with the team. */
export default async function HelpRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const ctx = await getAuthContext();
  const db = await portalDb();
  const [{ data: request }, { data: replies }] = await Promise.all([
    db
      .from("help_requests")
      .select("id, org_id, topic, message, status, page_path, lead_id, created_by_name, created_at")
      .eq("id", id)
      .eq("org_id", ctx.org.id)
      .maybeSingle(),
    db
      .from("help_replies")
      .select("id, author_name, from_team, body, created_at")
      .eq("request_id", id)
      .eq("org_id", ctx.org.id)
      .order("created_at"),
  ]);
  if (!request) notFound();
  const row = request as HelpRequestView;
  const status = HELP_STATUS[row.status] ?? HELP_STATUS.received!;

  return (
    <PageFrame
      title={HELP_TOPICS[row.topic] ?? HELP_TOPICS.general}
      description={row.page_path ? `Asked from ${row.page_path}.` : undefined}
      actions={<StatusBadge label={status.label} tone={status.tone} />}
    >
      {query.sent ? (
        <Alert variant="success">
          <AlertDescription>Sent. Your Vistrial team has it and you will get an email when they reply.</AlertDescription>
        </Alert>
      ) : null}
      {row.lead_id ? (
        <p className={helperClass}>
          About{" "}
          <Link href={`/app/cases/${row.lead_id}`} className="underline">
            this lead
          </Link>
          .
        </p>
      ) : null}
      <HelpThread request={row} replies={(replies ?? []) as HelpReplyView[]} />
      {row.status === "closed" ? (
        <p className={helperClass}>This request is closed. Reply below to open it again.</p>
      ) : null}
      <h2 className={cardTitle}>Add to this</h2>
      <FollowUpForm requestId={row.id} />
      {row.status !== "closed" ? <CloseRequestButton requestId={row.id} /> : null}
      <Link href="/app/help" className="text-sm text-brand-300 underline">
        Back to Help
      </Link>
    </PageFrame>
  );
}
