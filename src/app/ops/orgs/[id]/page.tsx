import { notFound } from "next/navigation";
import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getStaffContext } from "@/lib/auth/staff";
import { inviteUrl } from "@/lib/auth/paths";
import { formatRelative } from "@/lib/format";
import { loadStaffOrgOverview, logStaffAccess } from "@/lib/onboarding/staff";
import { helperClass, labelClass } from "@/lib/ui";

export default async function OpsOrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  await getStaffContext();
  const { id } = await params;
  const query = await searchParams;
  const rows = await loadStaffOrgOverview();
  const row = rows.find((item) => item.id === id);
  if (!row) notFound();
  await logStaffAccess({ action: "view_org", orgId: row.id });
  const now = new Date().toISOString();

  return (
    <PageFrame
      title={row.name}
      description="Health, counts, and status. Transcripts, extractions, drafts, and message bodies are not available here."
      breadcrumbs={[{ href: "/ops", label: "Clients" }, { href: `/ops/orgs/${row.id}`, label: row.name }]}
    >
      {query.invite ? (
        <Panel className="mb-8 px-6 py-5">
          <p className="text-sm font-semibold text-white">Owner invite</p>
          <p className="mt-2 break-all text-xs text-silver">{inviteUrl(query.invite)}</p>
        </Panel>
      ) : null}

      {row.ingestionBroken ? (
        <Panel className="mb-8 border-flag-critical/40 px-6 py-5">
          <p className="text-sm font-semibold text-flag-critical">Ingestion is broken</p>
          <p className="mt-2 text-sm text-silver">
            Last event {row.lastEventAt ? formatRelative(row.lastEventAt, now) : "never received"}.
            {row.unprocessedEvents > 0 ? ` ${row.unprocessedEvents} events waiting.` : ""}
          </p>
        </Panel>
      ) : null}

      <Panel className="px-6 py-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className={labelClass}>Activation</dt>
            <dd className="text-sm text-white">{row.activatedAt ?? "Not live"}</dd>
          </div>
          <div>
            <dt className={labelClass}>CRM</dt>
            <dd className="text-sm text-white">
              <StatusBadge
                label={row.crmStatus ?? "none"}
                tone={row.crmStatus === "active" ? "good" : row.crmStatus === "broken" ? "critical" : "neutral"}
              />
              <span className="ml-2 text-silver">{row.locationName ?? "No location"}</span>
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Last event</dt>
            <dd className="text-sm text-white">{row.lastEventAt ? formatRelative(row.lastEventAt, now) : "Never"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Unprocessed events</dt>
            <dd className="text-sm text-white">{row.unprocessedEvents}</dd>
          </div>
          <div>
            <dt className={labelClass}>Backfill</dt>
            <dd className="text-sm text-white">{row.backfillGrade ?? row.backfillStatus ?? "None"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Field mapping saved</dt>
            <dd className="text-sm text-white">{row.fieldMapsSaved ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Active members</dt>
            <dd className="text-sm text-white">{row.activeMembers}</dd>
          </div>
          <div>
            <dt className={labelClass}>Voice examples</dt>
            <dd className="text-sm text-white">{row.voiceExamples ?? 0}</dd>
          </div>
          <div>
            <dt className={labelClass}>Transcript source</dt>
            <dd className="text-sm text-white">{row.transcriptChoice ?? "unset"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Leads since activation</dt>
            <dd className="text-sm text-white">{row.leadsSinceActivation}</dd>
          </div>
          <div>
            <dt className={labelClass}>Outcome metric</dt>
            <dd className="text-sm text-white">
              {row.outcomeMature && row.outcomePerHundred !== null && row.outcomeTooSmall === false
                ? `${row.outcomePerHundred} clients closed per hundred leads`
                : "Not mature enough to show"}
            </dd>
          </div>
        </dl>
        <p className={`${helperClass} mt-6`}>
          This console cannot open transcripts, extractions, drafts, or message content. Those stay
          in the client workspace.
        </p>
        <Link href="/ops" className="mt-4 inline-block text-sm text-brand-300">
          Back to clients
        </Link>
      </Panel>
    </PageFrame>
  );
}
