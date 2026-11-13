import { Brain, BarChart3, CircleHelp, CircleSlash, Eye, type LucideIcon } from "@/components/icons";
import { EVIDENCE_MEANING, EVIDENCE_ORDER, isEvidenceWord, type EvidenceWord } from "@/lib/readable/evidence";
import { cn } from "@/lib/utils";

const ICON: Record<EvidenceWord, LucideIcon> = { Observed: Eye, Inference: Brain, "Untested hypothesis": CircleHelp, "Your data": BarChart3, "Not enough data": CircleSlash };
const LOOK: Record<EvidenceWord, string> = {
  Observed: "border-success/30 bg-success/8 text-success-foreground",
  "Your data": "border-info/30 bg-info/8 text-info-foreground",
  Inference: "border-primary/25 bg-primary/8 text-primary",
  "Untested hypothesis": "border-dashed border-border bg-transparent text-card-foreground",
  "Not enough data": "border-dashed border-border bg-transparent text-muted-foreground",
};

/**
 * The evidence label beside a claim. The words come from the server (convex/lib/evidence.ts); this only draws
 * them, each with its own icon so the label never rests on colour. A label it does not know is drawn plainly.
 */
export function EvidenceLabel({ label, className }: { label: string; className?: string }) {
  const known = isEvidenceWord(label);
  const Icon = known ? ICON[label] : CircleHelp;
  return (
    <span title={known ? EVIDENCE_MEANING[label] : undefined} className={cn("inline-flex h-5.5 w-fit shrink-0 items-center gap-1 rounded-[6px] border px-1.5 text-xs font-medium whitespace-nowrap", known ? LOOK[label] : LOOK["Untested hypothesis"], className)}>
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">Evidence: </span>
      {label}
    </span>
  );
}

/** Every evidence label with what it means, strongest first. Sits one step away, under "What the labels mean". */
export function EvidenceLegend({ only }: { only?: readonly string[] }) {
  const shown = [...EVIDENCE_ORDER].reverse().filter((label) => !only || only.includes(label));
  return (
    <dl className="grid gap-1.5 text-sm">
      {shown.map((label) => (
        <div key={label} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <dt>
            <EvidenceLabel label={label} />
          </dt>
          <dd className="text-muted-foreground">{EVIDENCE_MEANING[label]}</dd>
        </div>
      ))}
    </dl>
  );
}
