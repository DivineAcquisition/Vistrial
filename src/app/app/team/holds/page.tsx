import { HoldReview } from "@/app/app/team/team-forms";
import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { helperClass } from "@/lib/ui";
import type { InboundHoldReason } from "@/types/database";

const REASON: Record<InboundHoldReason, string> = {
  unmatched: "Matches no workspace",
  ambiguous: "Matches more than one workspace",
  workspace_paused: "Workspace paused",
  workspace_closed: "Workspace closed",
  source_not_enabled: "Source not plugged in",
};

const SOURCE: Record<string, string> = {
  crm: "CRM",
  stripe_connect: "Stripe revenue",
  stripe_billing: "Stripe billing",
  telnyx: "Telnyx",
  transcripts: "Transcripts",
  forms: "Forms",
  commas: "Commas",
};

/** Events that could not be matched to exactly one open workspace. Nothing acted on them. */
export default async function TeamHoldsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: holds }, { data: orgs }] = await Promise.all([
    supabase
      .from("inbound_event_holds")
      .select("id, received_at, source, event_type, routing_key, reason, org_id, candidate_org_ids")
      .eq("review_status", "open")
      .order("received_at", { ascending: false })
      .limit(200),
    supabase.from("organizations").select("id, name"),
  ]);
  const orgName = new Map((orgs ?? []).map((org) => [org.id, org.name]));

  return (
    <PageFrame
      title="Holding area"
      description="Incoming events that matched no workspace, more than one, or one that is paused or closed. They were stored and nothing acted on them."
    >
      {(holds ?? []).length === 0 ? (
        <EmptyState kind="empty" title="Nothing held" detail="Every incoming event matched exactly one open workspace." />
      ) : (
        <Panel className="overflow-hidden px-2 py-2 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Why</TableHead>
                <TableHead className="hidden md:table-cell">Workspace</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(holds ?? []).map((hold) => {
                const candidates = hold.org_id ? [hold.org_id] : hold.candidate_org_ids;
                return (
                  <TableRow key={hold.id}>
                    <TableCell className="text-silver">{formatDateTime(hold.received_at)}</TableCell>
                    <TableCell className="text-white">
                      <div>{SOURCE[hold.source] ?? hold.source}</div>
                      <div className={helperClass}>{hold.event_type ?? "unknown event"}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={REASON[hold.reason] ?? hold.reason} tone="warning" />
                      {hold.routing_key ? <p className={helperClass}>{hold.routing_key}</p> : null}
                    </TableCell>
                    <TableCell className="hidden text-silver md:table-cell">
                      {candidates.length === 0 ? "None" : candidates.map((id) => orgName.get(id) ?? id).join(", ")}
                    </TableCell>
                    <TableCell>
                      <HoldReview holdId={hold.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}
    </PageFrame>
  );
}
