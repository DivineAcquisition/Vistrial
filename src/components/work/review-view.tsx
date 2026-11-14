"use client";

import type { FunctionReturnType } from "convex/server";

import { CheckCircle2, CircleDashed, CircleSlash, ClipboardList, Hand, ListChecks, MessageSquareText, Quote, SendIcon as Send, Target, TriangleAlert, Users, XCircle, type LucideIcon } from "@/components/icons";
import { EvidenceLabel } from "@/components/readable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { api } from "../../../convex/_generated/api";

import { SectionTitle } from "./work-shell";

export type ReviewData = FunctionReturnType<typeof api.callReviews.review>;
export type ReviewsData = FunctionReturnType<typeof api.callReviews.recent>;

function Block({ icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2">
      <SectionTitle icon={icon}>{title}</SectionTitle>
      {children}
    </section>
  );
}

const STATE: Record<ReviewData["state"], { words: string; badge: "success" | "warning" | "info" | "error" }> = {
  ready: { words: "Review ready", badge: "success" },
  needsReview: { words: "Review ready, needs a check", badge: "warning" },
  running: { words: "Being written", badge: "info" },
  failed: { words: "Could not be written", badge: "error" },
};

/** One call review, built from its saved view. Every line keeps the label code gave it. */
export function ReviewView({ review, onClose }: { review: ReviewData; onClose?: () => void }) {
  const view = review.view;
  const look = STATE[review.state];
  const head = (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="grid min-w-0 gap-1">
        <p className="text-xs font-medium text-muted-foreground">Dealmaker · call review</p>
        <h2 className="font-heading text-lg text-foreground">{review.leadName}</h2>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={look.badge} size="sm">
          {look.words}
        </Badge>
        {onClose ? (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Back to calls
          </Button>
        ) : null}
      </div>
    </div>
  );
  if (!view) {
    return (
      <Panel className="grid gap-3 p-4 sm:p-6">
        {head}
        <p className="text-sm text-muted-foreground">{review.state === "running" ? "Dealmaker is reviewing this call." : "This review could not be written. Nothing was filed from it."}</p>
      </Panel>
    );
  }
  const said = view.fit.filter((row) => row.said).length;
  const answered = view.objections.filter((row) => row.answered).length;
  return (
    <Panel className="grid min-w-0 gap-5 p-4 sm:p-6" data-review={review.id}>
      {head}
      <div className="grid gap-1.5">
        <p className="text-base text-foreground">{view.outcome}</p>
        {view.nextStep ? <p className="text-sm text-foreground">Next step: {view.nextStep}</p> : null}
        <EvidenceLabel label="Inference" />
      </div>
      {!view.checksPassed ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/8 p-3 text-sm text-foreground">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          This review did not pass every check, so nothing was filed from it: no readiness, commitments, recap or CRM update. Check it first.
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="At a glance">
        {[
          ["Fit fields said", `${said} of ${view.fit.length}`],
          ["Objections answered", `${answered} of ${view.objections.length}`],
          ["Commitments", String(view.commitments.length)],
          ["CRM updates", String(view.updates.length)],
        ].map(([label, value]) => (
          <li key={label} className="grid gap-0.5 rounded-lg border border-border p-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="font-heading text-lg text-foreground tabular-nums">{value}</span>
          </li>
        ))}
      </ul>

      {view.talk ? (
        <Block icon={Users} title="Who spoke">
          <ul className="grid gap-1.5">
            {view.talk.map((row) => (
              <li key={row.name} className="grid gap-1 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-foreground">{row.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.share}% of the words · {row.questions} question{row.questions === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${row.share}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <EvidenceLabel label="Your data" /> Measured result: counted from the transcript&apos;s speaker labels.
          </span>
        </Block>
      ) : null}

      <Block icon={ListChecks} title="Fit">
        <ul className="grid gap-2 sm:grid-cols-2">
          {view.fit.map((row) => (
            <li key={row.field} className="grid min-w-0 gap-1 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{row.label}</span>
                {row.said ? (
                  <Badge variant="success" size="sm">
                    <CheckCircle2 aria-hidden className="size-3" />
                    Said
                  </Badge>
                ) : (
                  <Badge variant="outline" size="sm">
                    <CircleSlash aria-hidden className="size-3" />
                    Not raised
                  </Badge>
                )}
              </div>
              {row.said ? (
                <>
                  <p className="text-sm text-foreground">{row.finding}</p>
                  <p className="text-xs break-words text-muted-foreground">
                    {row.kind}: &ldquo;{row.quote}&rdquo;
                  </p>
                </>
              ) : (
                <EvidenceLabel label="Not enough data" />
              )}
            </li>
          ))}
        </ul>
      </Block>

      {view.objections.length ? (
        <Block icon={Quote} title="Objections">
          <ul className="grid gap-2">
            {view.objections.map((row, i) => (
              <li key={i} className="grid gap-1 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-foreground">{row.text}</span>
                  {row.answered ? (
                    <Badge variant="success" size="sm">
                      <CheckCircle2 aria-hidden className="size-3" />
                      Answered on the call
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">
                      <XCircle aria-hidden className="size-3" />
                      Not answered
                    </Badge>
                  )}
                </div>
                <span className="text-xs break-words text-muted-foreground">
                  {row.kind}: &ldquo;{row.quote}&rdquo;
                </span>
                {row.answered && row.answerQuote ? <span className="text-xs break-words text-muted-foreground">Answer: &ldquo;{row.answerQuote}&rdquo;</span> : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.commitments.length ? (
        <Block icon={Hand} title="Commitments">
          <ul className="grid gap-1.5 text-sm">
            {view.commitments.map((row, i) => (
              <li key={i} className="grid gap-0.5 rounded-md bg-muted/40 px-3 py-2">
                <span className="text-foreground">
                  <span className="font-medium">{row.owner}:</span> {row.what}
                  {row.due ? <span className="text-muted-foreground"> · by {new Date(row.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : null}
                </span>
                <span className="text-xs break-words text-muted-foreground">
                  {row.kind}: &ldquo;{row.quote}&rdquo;
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.coverage.length ? (
        <Block icon={ClipboardList} title="Your script">
          <ul className="grid gap-1.5 text-sm">
            {view.coverage.map((row) => (
              <li key={row.title} className="flex min-w-0 items-start gap-2">
                {row.covered ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 text-foreground">
                  {row.title}
                  <span className="text-xs text-muted-foreground"> · {row.covered ? `covered: “${row.quote}”` : "not seen on the call"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.updates.length ? (
        <Block icon={Target} title="CRM updates">
          <ul className="grid gap-1.5 text-sm">
            {view.updates.map((row, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <span className="text-foreground">{row.words}</span>
                <span className="text-xs text-muted-foreground">{row.state === "proposed" ? "Waiting for approval" : row.detail}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {view.recap ? (
        <Block icon={Send} title="Recap for the lead">
          <div className="grid gap-1 rounded-lg border border-border p-3 text-sm">
            <span className="font-medium text-foreground">{view.recap.subject}</span>
            <p className="whitespace-pre-line text-foreground">{view.recap.body}</p>
          </div>
          <p className="text-xs text-muted-foreground">{view.recap.draftId ? "A draft in Comms. Nothing is sent until a person approves it there." : "Not drafted in Comms: this call has no lead from your CRM. Copy it if you want to send it."}</p>
        </Block>
      ) : null}

      {review.coaching?.length ? (
        <Block icon={MessageSquareText} title="Coaching (only you see this)">
          <ul className="grid gap-1 text-sm text-foreground">
            {review.coaching.map((row, i) => (
              <li key={i}>{row}</li>
            ))}
          </ul>
          <EvidenceLabel label="Inference" />
        </Block>
      ) : null}

      {view.missing.length ? (
        <Block icon={CircleSlash} title="What this review could not read">
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {view.missing.map((row, i) => (
              <li key={i}>{row}</li>
            ))}
          </ul>
        </Block>
      ) : null}
    </Panel>
  );
}
