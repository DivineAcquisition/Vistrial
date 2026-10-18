import { CALL_PENDING_NOTE, DO_NOT_CONTACT_LABEL, EARLY_NOTE, NO_CALL_NOTE, UNCLEAR_CALL_NOTE, hiddenCallReasonLine } from "@/lib/assay/copy";
import { TIER_LABEL, type Tier } from "@/lib/assay/types";

export type AssayReasonView = {
  reason: string;
  points: number;
  callBased: boolean;
  href?: string | null;
};

export type AssayPanelModel = {
  score: number;
  tier: Tier;
  displayTier: Tier | "do_not_contact";
  early: boolean;
  noCall: boolean;
  callPending: boolean;
  unclearCall: number;
  reasons: AssayReasonView[];
  canSeeCall: boolean;
  history: Array<{ at: string; line: string }>;
  learningNote: string | null;
};

function tone(tier: Tier | "do_not_contact"): string {
  if (tier === "hot") return "border-destructive/40 bg-destructive/10";
  if (tier === "warm") return "border-warning/40 bg-warning/10";
  if (tier === "do_not_contact") return "border-border bg-muted";
  return "border-border bg-card";
}

export function AssayScorePanel({ model }: { model: AssayPanelModel }) {
  const hidden = model.canSeeCall ? [] : model.reasons.filter((reason) => reason.callBased);
  const shown = model.canSeeCall ? model.reasons : model.reasons.filter((reason) => !reason.callBased);
  const up = shown.filter((reason) => reason.points > 0);
  const down = shown.filter((reason) => reason.points < 0);
  const label = model.displayTier === "do_not_contact" ? DO_NOT_CONTACT_LABEL : `${TIER_LABEL[model.tier]} ${model.score}`;
  return (
    <section className={`rounded-lg border p-4 ${tone(model.displayTier)} ${model.early ? "opacity-80" : ""}`} aria-label="Assay score">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Assay score</h2>
        <p className="text-lg font-medium tabular-nums">{label}</p>
      </div>
      {model.displayTier === "do_not_contact" ? (
        <p className="mt-2 text-sm text-muted-foreground">This lead is not ranked for outreach.</p>
      ) : (
        <>
          {model.early ? <p className="mt-2 text-sm text-muted-foreground">{EARLY_NOTE}</p> : null}
          {model.noCall ? <p className="mt-2 text-sm text-muted-foreground">{NO_CALL_NOTE}</p> : null}
          {model.callPending ? <p className="mt-2 text-sm text-muted-foreground">{CALL_PENDING_NOTE}</p> : null}
          {model.unclearCall > 0 ? <p className="mt-2 text-sm text-muted-foreground">{UNCLEAR_CALL_NOTE}</p> : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-medium text-muted-foreground">Raising the score</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {up.length ? up.map((reason) => <li key={reason.reason}>{reason.href ? <a className="underline" href={reason.href}>{reason.reason}</a> : reason.reason}</li>) : <li>Nothing strong yet.</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-medium text-muted-foreground">Lowering the score</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {down.length ? down.map((reason) => <li key={reason.reason}>{reason.reason}</li>) : <li>Nothing pulling it down.</li>}
              </ul>
            </div>
          </div>
          {hidden.length ? <p className="mt-3 text-sm text-muted-foreground">{hiddenCallReasonLine(hidden.length)}</p> : null}
        </>
      )}
      {model.learningNote ? <p className="mt-3 text-xs text-muted-foreground">{model.learningNote}</p> : null}
      {model.history.length ? (
        <ol className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
          {model.history.map((row) => (
            <li key={row.at}>{row.line}</li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export function WhyFirst({
  urgency,
  reasons,
  canSeeCall,
}: {
  urgency: string | null;
  reasons: AssayReasonView[];
  canSeeCall: boolean;
}) {
  const hidden = canSeeCall ? 0 : reasons.filter((reason) => reason.callBased).length;
  const shown = canSeeCall ? reasons : reasons.filter((reason) => !reason.callBased);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Why first?</summary>
      <div className="mt-2 space-y-1">
        {urgency ? <p>Urgency: {urgency}</p> : null}
        {shown.length ? (
          <ul className="list-disc pl-5">
            {shown.map((reason) => (
              <li key={reason.reason}>{reason.reason}</li>
            ))}
          </ul>
        ) : (
          <p>No score reasons yet.</p>
        )}
        {hidden ? <p>{hiddenCallReasonLine(hidden)}</p> : null}
      </div>
    </details>
  );
}
