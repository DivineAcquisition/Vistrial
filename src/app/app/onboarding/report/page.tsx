import Link from "next/link";

import { BenchmarkPanel } from "@/app/app/onboarding/payoffs";
import { RegenerateLeakReport } from "@/app/app/onboarding/report/regenerate";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { BarChart } from "@/components/ui/chart";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatMoney,
  leakFindingLines,
  parseLeakReport,
  type LeakFinding,
  type LeakReport,
} from "@/lib/profile/leak";
import { loadLatestLeakReport, requireProfileAccess } from "@/lib/profile/load";
import { asArray, asRecord, num, parseBenchmark, str } from "@/lib/profile/parse";
import { cardTitle, helperClass } from "@/lib/ui";

const BASIS_TONE = {
  backfill: "good",
  backfill_partial: "warning",
  profile_only: "critical",
} as const;

const BASIS_LABEL = {
  backfill: "Measured",
  backfill_partial: "Measured, with gaps named",
  profile_only: "Your stated figures",
} as const;

/** Only the sources with a rate worth drawing; the rest stay in the trace list. */
function sourceChartPoints(finding: LeakFinding) {
  return asArray(finding.extra.rows).flatMap((item) => {
    const row = asRecord(item);
    const rate = asRecord(row.rate);
    const pct = num(rate.pct);
    const source = str(row.source);
    return pct === null || !source ? [] : [{ label: source, value: pct }];
  });
}

function MovementPanel({ report }: { report: LeakReport }) {
  if (report.movement.length === 0) return null;
  return (
    <Panel className="p-6">
      <h3 className={cardTitle}>Movement since the first report</h3>
      <p className={helperClass}>
        Measured against the same baseline, cut on{" "}
        {report.movementAgainst ? new Date(report.movementAgainst).toLocaleDateString() : "the first run"}
        , so this is movement rather than a re-cut.
      </p>
      <DefinitionList>
        {report.movement.map((row) => (
          <KeyValue key={row.key} label={row.key.replace(/_/g, " ")}>
            {row.first} → {row.now} ({row.delta > 0 ? "+" : ""}
            {row.delta})
          </KeyValue>
        ))}
      </DefinitionList>
    </Panel>
  );
}

export default async function LeakReportPage() {
  const ctx = await requireProfileAccess();
  const latest = await loadLatestLeakReport(ctx.org.id);

  if (!latest) {
    return (
      <PageFrame
        title="Leak Report"
        description="Where your leads are going, from your own history."
      >
        <EmptyState
          title="No report has been generated yet."
          detail="It is built from your CRM history plus the answers on your business profile. Finish the profile and generate it here."
          action={<RegenerateLeakReport label="Generate the report" />}
          secondaryAction={
            <Button variant="secondary" render={<Link href="/app/onboarding" />}>
              Back to onboarding
            </Button>
          }
        />
      </PageFrame>
    );
  }

  const report = parseLeakReport(asRecord(latest.payload));
  const history = asArray(latest.history);

  return (
    <PageFrame
      title="Leak Report"
      description="Where your leads are going, from your own history."
      actions={
        <Button variant="primary" size="lg" render={<Link href="/app/settings/business-profile" />}>
          Turn Vistrial on
        </Button>
      }
      secondaryActions={
        <div className="flex flex-wrap items-center gap-3">
          <RegenerateLeakReport label="Regenerate" />
          <form action="/app/onboarding/report/pdf" method="post">
            <Button type="submit" variant="secondary" size="lg">
              Download PDF
            </Button>
          </form>
        </div>
      }
    >
      <div className="space-y-6">
        <Panel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className={cardTitle}>{report.orgName}</h2>
              <p className={helperClass}>{report.basisLabel}</p>
            </div>
            <StatusBadge label={BASIS_LABEL[report.basis]} tone={BASIS_TONE[report.basis]} />
          </div>
          <DefinitionList>
            <KeyValue label="Generated">
              {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "—"}
            </KeyValue>
            <KeyValue label="History covered">
              {report.windowStart && report.windowEnd
                ? `${new Date(report.windowStart).toLocaleDateString()} to ${new Date(report.windowEnd).toLocaleDateString()}`
                : "No measurable history"}
            </KeyValue>
            <KeyValue label="Your figures used">
              {report.stated.closeRatePct ?? "—"}% close rate at{" "}
              {formatMoney(report.stated.pricePointCents)} a client
            </KeyValue>
            <KeyValue label="Profile version">{report.profileVersion}</KeyValue>
            <KeyValue label="Generations kept">{history.length}</KeyValue>
          </DefinitionList>
          {report.missing.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm text-flag-warning">What is missing from the history:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-silver">
                {report.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>

        {report.findings.map((finding) => {
          // Close rate by source is a comparison across a handful of named
          // things, which reads far faster as bars than as a list of rates.
          const sourceBars =
            finding.key === "close_rate_by_source" && finding.shown
              ? sourceChartPoints(finding)
              : null;

          return (
            <Panel key={finding.key} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <h3 className={cardTitle}>{finding.title}</h3>
                {finding.shown ? null : <StatusBadge label="Not measurable" tone="neutral" />}
              </div>
              {sourceBars && sourceBars.length > 0 ? (
                <div className="mt-4">
                  <BarChart
                    label="Close rate by source"
                    points={sourceBars}
                    format={(value) => `${value}%`}
                  />
                </div>
              ) : null}
              <ul className="mt-4 space-y-1.5 text-sm text-silver">
                {leakFindingLines(finding, report.minSample).map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </Panel>
          );
        })}

        <BenchmarkPanel benchmark={parseBenchmark(report.benchmark)} />
        <MovementPanel report={report} />

        {history.length > 1 ? (
          <Panel className="p-6">
            <h3 className={cardTitle}>Earlier generations</h3>
            <DefinitionList>
              {history.slice(1).map((item) => {
                const row = asRecord(item);
                return (
                  <KeyValue
                    key={str(row.id) ?? String(num(row.generated_at))}
                    label={
                      str(row.generated_at)
                        ? new Date(str(row.generated_at) as string).toLocaleString()
                        : "—"
                    }
                  >
                    {BASIS_LABEL[(str(row.basis) as keyof typeof BASIS_LABEL) ?? "profile_only"]}
                  </KeyValue>
                );
              })}
            </DefinitionList>
          </Panel>
        ) : null}
      </div>
    </PageFrame>
  );
}
