import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportActions } from "@/app/app/forsight/reports/report-actions";
import { ReportDocument } from "@/app/app/forsight/reports/report-document";
import { ForsightTabs } from "@/app/app/forsight/forsight-chrome";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import {
  loadSendsForReport,
  loadStoredReport,
  listReportVersions,
  periodPath,
  periodStartFromParam,
} from "@/lib/forsight/report/load";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { requireReportingAccess } from "@/lib/reporting/access";
import { createClient } from "@/lib/supabase/server";
import { bodyText, captionText } from "@/lib/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  return { title: `${period} report · Forsight` };
}

export default async function ForsightReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ period: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireReportingAccess();
  const { period: periodParam } = await params;
  const query = await searchParams;
  const periodStart = periodStartFromParam(periodParam);
  if (!periodStart) notFound();

  const requestedVersion = ctx.isPlatformAdmin ? parseVersion(query.v) : null;
  const supabase = await createClient();
  const stored = await loadStoredReport(supabase, {
    orgId: ctx.org.id,
    periodStart,
    version: requestedVersion,
  });

  const versions = ctx.isPlatformAdmin
    ? await listReportVersions(supabase, ctx.org.id, periodStart)
    : [];
  const sends =
    ctx.isPlatformAdmin && stored ? await loadSendsForReport(supabase, stored.id) : [];

  return (
    <PageFrame
      title={stored?.report.period.label ?? periodParam}
      eyebrow={ctx.org.name}
      description="A frozen snapshot. Viewing it never re-reads the source."
      toolbar={<ForsightTabs activeHref={`${FORSIGHT_PATH}/reports`} isPlatformAdmin={ctx.isPlatformAdmin} />}
      actions={
        stored ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`${FORSIGHT_PATH}/reports/${periodPath(periodStart)}/export${
                  ctx.isPlatformAdmin ? `?v=${stored.version}` : ""
                }`}
              >
                Export PDF
              </Link>
            </Button>
            {ctx.isPlatformAdmin ? (
              <ReportActions
                orgId={ctx.org.id}
                periodStart={periodStart}
                version={stored.version}
                hasReport
              />
            ) : null}
          </div>
        ) : ctx.isPlatformAdmin ? (
          <ReportActions orgId={ctx.org.id} periodStart={periodStart} version={null} hasReport={false} />
        ) : undefined
      }
    >
      {!stored ? (
        <EmptyState
          kind="empty"
          title="This month has not been generated"
          detail={
            ctx.isPlatformAdmin
              ? "Generate it here. Nothing is emailed until you send it."
              : "This month has not been generated yet."
          }
        />
      ) : (
        <>
          {ctx.isPlatformAdmin && versions.length > 1 ? (
            <p className={captionText}>
              Versions:{" "}
              {versions.map((row, index) => (
                <span key={row.version}>
                  {index > 0 ? " · " : null}
                  <Link
                    href={`${FORSIGHT_PATH}/reports/${periodPath(periodStart)}?v=${row.version}`}
                    className={row.version === stored.version ? "text-card-foreground" : "text-brand-300"}
                  >
                    v{row.version}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}

          <ReportDocument
            report={stored.report}
            generatedLabel={formatWhen(stored.generatedAt, ctx.org.timezone)}
            version={stored.version}
          />

          {ctx.isPlatformAdmin ? (
            <Panel className="p-5">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
                Omitted lines
              </p>
              {stored.omissions.length > 0 ? (
                <div className="mt-3">
                  <p className="text-sm text-card-foreground">Lines omitted from this report</p>
                  <ul className="mt-2 space-y-1">
                    {stored.omissions.map((row) => (
                      <li key={`${row.section}:${row.line}`} className={bodyText}>
                        {row.section} — {row.line}: {row.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className={`mt-3 ${bodyText}`}>No lines were omitted.</p>
              )}
              <div className="mt-4">
                <p className="text-sm text-card-foreground">Sends</p>
                {sends.length === 0 ? (
                  <p className={`mt-2 ${bodyText}`}>Not sent. Generation never sends on its own.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {sends.map((send) => (
                      <li key={send.id} className={bodyText}>
                        {formatWhen(send.sent_at, ctx.org.timezone)}
                        {send.sent_by_email ? ` · ${send.sent_by_email}` : ""} · v{send.version} ·{" "}
                        {send.recipients.join(", ")}
                        {send.error ? ` · failed: ${send.error}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          ) : null}
        </>
      )}
    </PageFrame>
  );
}

function parseVersion(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatWhen(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
