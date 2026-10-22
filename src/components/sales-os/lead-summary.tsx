import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { CaseFilePayload } from "@/lib/cases/types";
import { relativeTime, stageLabel, type NowSummary } from "@/lib/sales-os/now";

const TIER_LABEL: Record<string, string> = { hot: "Hot", warm: "Warm", cool: "Cool", cold: "Cold" };
const TIER_VARIANT: Record<string, "warning" | "info" | "outline"> = { hot: "warning", warm: "info", cool: "outline", cold: "outline" };

export function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <Badge variant="outline">Not scored yet</Badge>;
  return <Badge variant={TIER_VARIANT[tier] ?? "outline"}>{TIER_LABEL[tier] ?? tier}</Badge>;
}

/** Name, owner, stage, tier with reasons, source, and the next step. */
export function LeadHeader({ payload, now, compact = false }: { payload: CaseFilePayload; now: number; compact?: boolean }) {
  const lead = payload.lead;
  const owner = lead.assignedCloserName ?? lead.assignedSetterName;
  const next = payload.nextActions
    .filter((action) => !action.completedAt)
    .sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))[0];
  const reasons = payload.score ? [...payload.score.raising, ...payload.score.lowering].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, compact ? 2 : 3) : [];

  return (
    <div className="flex flex-col gap-3">
      {compact ? (
        <Link href={`/app/leads/${lead.id}`} className="font-heading text-lg text-card-foreground underline-offset-4 hover:underline">
          {lead.name}
        </Link>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Owner</dt>
          <dd>{owner ?? "No owner yet"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Stage</dt>
          <dd>{stageLabel(lead.pipelineStage ?? lead.status)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Source</dt>
          <dd>{lead.source ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tier</dt>
          <dd>
            <TierBadge tier={payload.score?.tier ?? null} />
          </dd>
        </div>
      </dl>
      {reasons.length ? (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Why this tier">
          {reasons.map((reason) => (
            <li key={reason.ruleId} className="flex gap-2">
              <span aria-hidden className={reason.impact >= 0 ? "text-success-foreground" : "text-warning-foreground"}>
                {reason.impact >= 0 ? "+" : "-"}
              </span>
              <span>
                {reason.text}
                <span className="sr-only">{reason.impact >= 0 ? " raised the score" : " lowered the score"}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm">
        <span className="text-muted-foreground">Next step: </span>
        {next ? (
          <>
            {next.actionText}
            {next.dueAt ? <span className={next.overdue ? "text-warning-foreground" : "text-muted-foreground"}> · due {relativeTime(next.dueAt, now)}</span> : null}
          </>
        ) : (
          <span className="text-muted-foreground">None set</span>
        )}
      </p>
    </div>
  );
}

export function NowPanel({ summary }: { summary: NowSummary }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1 text-sm">
        {summary.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {summary.firstLook ? (
        <p className="text-xs text-muted-foreground">First time you opened this lead.</p>
      ) : summary.changed.length ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Since you last looked</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {summary.changed.slice(0, 6).map((change) => (
              <li key={`${change.at}-${change.label}`}>{change.label}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing changed since you last looked.</p>
      )}
    </div>
  );
}
