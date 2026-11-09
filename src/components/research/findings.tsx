"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_LABEL, UNCERTAINTY_WORDS } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Studio } from "./studio-parts";
import { OpportunityDecision } from "@/components/research/outcome-loop";
import { showError } from "@/lib/errors/show-error";

export type SourceLite = { id: string; title: string; url: string; platform: string; publisher: string | null; origin?: string };

const BASIS_WORDS: Record<string, { label: string; tone: "good" | "warning" | "neutral" | "brand" }> = {
  observed: { label: "Observed", tone: "good" },
  inferred: { label: "Inference", tone: "brand" },
  hypothesis: { label: "Untested hypothesis", tone: "warning" },
  firstParty: { label: "Your data", tone: "good" },
  insufficient: { label: "Not enough data", tone: "neutral" },
};

/**
 * A numbered chip per cited source. With a board link, every chip opens the board on exactly the sources
 * behind this claim; without one (story pages), a chip opens the source itself.
 */
function EvidenceChips({ ids, sources, boardHref }: { ids: string[]; sources: Map<string, SourceLite>; boardHref?: string }) {
  if (ids.length === 0) return null;
  const chip = "inline-block max-w-64 truncate rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Sources">
      {ids.map((id, index) => {
        const source = sources.get(id);
        const label = source ? `${PLATFORM_LABEL[source.platform] ?? source.platform}: ${source.publisher ?? source.title}` : "Source no longer available";
        return (
          <li key={id}>
            {!source ? (
              <span className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground">{label}</span>
            ) : boardHref ? (
              <Link href={`${boardHref}?focus=${ids.join(",")}`} className={chip} title={source.title}>
                [{index + 1}] {label}
              </Link>
            ) : (
              <a href={source.url} target="_blank" rel="noreferrer noopener" className={chip} title={source.title}>
                [{index + 1}] {label}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The eight completion checks, passed or not, in plain words. A failed one comes first. */
export function ChecksList({ checks }: { checks: NonNullable<Studio["checks"]> }) {
  const ordered = [...checks.results].sort((a, b) => Number(a.passed) - Number(b.passed) || a.id - b.id);
  return (
    <ul className="grid gap-2">
      {ordered.map((row) => (
        <li key={row.id} className="flex gap-2 text-sm">
          <span aria-hidden className={row.passed ? "text-success" : "text-destructive"}>
            {row.passed ? "✓" : "✕"}
          </span>
          <span className="min-w-0">
            <span className="font-medium text-card-foreground">{row.name}.</span> <span className="text-muted-foreground">{row.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Judgment stays human": the approval says exactly what approving does, before anyone presses it. A
 * draft that failed its checks cannot be approved; it is edited or rejected with a reason.
 */
export function ApprovalCard({ workspaceId, assetId, status, canDecide }: { workspaceId: Id<"workspaces">; assetId: Id<"assets">; status: string; canDecide: boolean }) {
  const approve = useMutation(api.assets.approve);
  const reject = useMutation(api.assets.reject);
  const requestRevision = useMutation(api.assets.requestRevision);
  // "reject" or "changes": which reason form is open.
  const [rejecting, setRejecting] = useState<false | "reject" | "changes">(false);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const waiting = status === "draft" || status === "needsReview";
  return (
    <Panel className="grid gap-3 p-4 sm:p-5">
      <h2 className="font-heading text-base text-card-foreground">Your decision</h2>
      {!waiting ? (
        <p className="text-sm text-muted-foreground">{status === "approved" ? "Approved." : status === "rejected" ? "Rejected. The reason is saved as feedback." : "Not waiting."}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {status === "needsReview"
              ? "This draft did not pass every check, so it cannot be approved as it is. Edit it on the report page, or reject it with a reason."
              : "Approving marks this version of the report as approved. Nothing is published, sent or spent. Later skills can then build on it."}
          </p>
          {canDecide ? (
            rejecting ? (
              <form
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const done = (words: string) => {
                    setRejecting(false);
                    setReason("");
                    setNotice(words);
                  };
                  void (rejecting === "reject"
                    ? reject({ workspaceId, assetId, reason }).then(() => done("Rejected. The reason is saved as feedback you can turn into a business fact."))
                    : requestRevision({ workspaceId, assetId, reason }).then(() => done("Saved. The report stays waiting, and the request is kept as feedback."))
                  ).catch((problem: unknown) => setNotice(showError(problem, "It was not saved.")));
                }}
              >
                <label className="grid gap-2 text-sm" htmlFor="findings-reason">
                  {rejecting === "reject" ? "Why are you rejecting it?" : "What should change?"}
                  <Textarea id="findings-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="outline" disabled={reason.trim().length < 3}>
                    {rejecting === "reject" ? "Reject with this reason" : "Request these changes"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                {status === "draft" ? (
                  <Button
                    type="button"
                    onClick={() =>
                      void approve({ workspaceId, assetId }).then(
                        () => setNotice("Approved."),
                        (problem: unknown) => setNotice(showError(problem, "It was not approved. Look again and retry.")),
                      )
                    }
                  >
                    Approve report
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={() => setRejecting("changes")}>
                  Request changes
                </Button>
                <Button type="button" variant="outline" onClick={() => setRejecting("reject")}>
                  Reject
                </Button>
                <Button variant="ghost" render={<Link href={`/app/assets/${assetId}`} />}>
                  Open the full report
                </Button>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">An owner or manager decides.</p>
          )}
        </>
      )}
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {notice}
      </p>
    </Panel>
  );
}

/**
 * Findings (doctrine 3.6): the opportunities, each with its five fields and its basis, the findings with
 * theirs, the limits, and the checks. Every claim links back to the sources behind it.
 */
export function FindingsView({
  workspaceId,
  studio,
  sources,
  assetStatus,
  canDecide,
  boardHref,
  showDecision = true,
}: {
  workspaceId: Id<"workspaces">;
  studio: Studio;
  sources: Map<string, SourceLite>;
  assetStatus: string | null;
  canDecide: boolean;
  /** The project's board. Evidence chips open it on the sources behind each claim. */
  boardHref?: string;
  /** The Studio shows the decision in its own Review section. */
  showDecision?: boolean;
}) {
  const report = studio.report;
  if (!report) {
    return (
      <Panel className="p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">Findings appear when the report is written. The agent studies first.</p>
      </Panel>
    );
  }
  const failed = studio.checks && !studio.checks.passed;
  return (
    <div className="grid min-w-0 gap-4">
      {failed && studio.checks ? (
        <Panel className="grid gap-3 border-destructive/50 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label="Needs review" tone="critical" className="[&_span]:normal-case" />
            <span className="text-sm text-muted-foreground">These checks did not pass. Nothing was invented to make them pass.</span>
          </div>
          <ChecksList checks={studio.checks} />
          {studio.run?.reserveSkipped ? <p className="text-sm text-muted-foreground">Some steps were skipped to keep money for the final check.</p> : null}
        </Panel>
      ) : null}

      <Panel className="grid gap-2 p-4 sm:p-5">
        <h2 className="font-heading text-base text-card-foreground">Summary</h2>
        <p className="text-sm text-card-foreground">{report.summary}</p>
      </Panel>

      <section className="grid gap-3" aria-labelledby="opps-heading">
        <h2 id="opps-heading" className="font-heading text-lg text-foreground">
          Opportunities
        </h2>
        <ol className="grid gap-3">
          {report.opportunities.map((row, index) => {
            const basis = UNCERTAINTY_WORDS[row.evidence.uncertainty] ?? UNCERTAINTY_WORDS.none;
            return (
              <li key={`${index}-${row.opportunity}`}>
                <Panel className="grid gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="font-heading text-sm text-brand-500 tabular-nums" aria-hidden>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="min-w-0 flex-1 font-heading text-base break-words text-card-foreground">{row.opportunity}</h3>
                    <StatusBadge label={basis.label} tone={basis.tone} className="[&_span]:normal-case" />
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="grid gap-1">
                      <dt className="text-muted-foreground">Why it matters here</dt>
                      <dd className="text-card-foreground">{row.businessRelevance.text}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-muted-foreground">Proposed action</dt>
                      <dd className="text-card-foreground">{row.proposedAction}</dd>
                    </div>
                    <div className="grid gap-1 sm:col-span-2">
                      <dt className="text-muted-foreground">How to tell if it worked</dt>
                      <dd className="text-card-foreground">{row.validationMethod}</dd>
                    </div>
                  </dl>
                  <EvidenceChips ids={row.evidence.sourceRefIds} sources={sources} boardHref={boardHref} />
                  <OpportunityDecision workspaceId={workspaceId} projectId={studio.project.id} index={index} ready={Boolean(studio.assetId)} />
                </Panel>
              </li>
            );
          })}
        </ol>
        {report.opportunities.length < 3 ? (
          <p className="text-sm text-muted-foreground">
            Only {report.opportunities.length} could be supported by the evidence. {report.missingOpportunityReason}
          </p>
        ) : null}
      </section>

      <section className="grid gap-3" aria-labelledby="findings-heading">
        <h2 id="findings-heading" className="font-heading text-lg text-foreground">
          What the sources show
        </h2>
        <ul className="grid gap-2">
          {report.findings.map((row, index) => {
            const basis = BASIS_WORDS[row.basis ?? ""] ?? { label: "No basis", tone: "neutral" as const };
            return (
              <li key={`${index}-${row.statement}`} className="grid gap-2 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm break-words text-card-foreground">{row.statement}</p>
                  <StatusBadge label={basis.label} tone={basis.tone} className="[&_span]:normal-case" />
                </div>
                <EvidenceChips ids={row.sourceRefIds} sources={sources} boardHref={boardHref} />
              </li>
            );
          })}
        </ul>
      </section>

      {report.limits.length > 0 ? (
        <Panel className="grid gap-2 p-4 sm:p-5">
          <h2 className="font-heading text-base text-card-foreground">What it could not see</h2>
          <ul className="grid gap-1.5 text-sm">
            {report.limits.map((row) => (
              <li key={`${row.platform}-${row.text}`}>
                <span className="font-medium text-card-foreground">{PLATFORM_LABEL[row.platform] ?? row.platform}:</span>{" "}
                <span className="text-muted-foreground">{row.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">A publicly visible ad or post is not evidence that it worked.</p>
        </Panel>
      ) : null}

      {studio.checks && studio.checks.passed ? (
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-card-foreground">All eight checks passed</summary>
          <div className="mt-3">
            <ChecksList checks={studio.checks} />
          </div>
        </details>
      ) : null}

      {showDecision && studio.assetId && assetStatus ? (
        <ApprovalCard workspaceId={workspaceId} assetId={studio.assetId as Id<"assets">} status={assetStatus} canDecide={canDecide} />
      ) : null}
    </div>
  );
}
