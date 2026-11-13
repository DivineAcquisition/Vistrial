import { Check, CircleDashed, CircleDot, Minus, X, type LucideIcon } from "@/components/icons";
import { JOB_STATUS_WORDS, type JobStatus } from "@/lib/readable/teardown";
import { cn } from "@/lib/utils";

export type ChipTone = "good" | "partly" | "bad" | "absent" | "quiet";

const ICON: Record<ChipTone, LucideIcon> = { good: Check, partly: CircleDot, bad: X, absent: CircleDashed, quiet: Minus };
const LOOK: Record<ChipTone, string> = {
  good: "border-success/30 bg-success/8 text-success-foreground",
  partly: "border-warning/40 bg-warning/8 text-warning-foreground",
  bad: "border-destructive/30 bg-destructive/8 text-destructive-foreground",
  absent: "border-dashed border-muted-foreground/50 bg-transparent text-card-foreground",
  quiet: "border-border bg-transparent text-muted-foreground",
};
export const TONE_ICON_CLASS: Record<ChipTone, string> = { good: "text-success-foreground", partly: "text-warning-foreground", bad: "text-destructive-foreground", absent: "text-card-foreground", quiet: "text-muted-foreground" };

export const JOB_TONE: Record<JobStatus, ChipTone> = { does: "good", partly: "partly", doesNot: "bad", skipped: "absent", leftOut: "quiet" };

/** Just the icon of a status, for tight places. Always give it words: pass `label` and it is read aloud. */
export function StatusIcon({ tone, label, className }: { tone: ChipTone; label: string; className?: string }) {
  const Icon = ICON[tone];
  return (
    <span className={cn("inline-flex shrink-0", TONE_ICON_CLASS[tone], className)}>
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A status as an icon and words. The tone only repeats what the words say. */
export function StatusChip({ tone, label, className }: { tone: ChipTone; label: string; className?: string }) {
  const Icon = ICON[tone];
  return (
    <span className={cn("inline-flex h-5.5 w-fit shrink-0 items-center gap-1 rounded-[6px] border px-1.5 text-xs font-medium whitespace-nowrap", LOOK[tone], className)}>
      <Icon aria-hidden className="size-3 shrink-0" />
      {label}
    </span>
  );
}

/** What one framework job is on one page. */
export function JobChip({ status, className }: { status: JobStatus; className?: string }) {
  return <StatusChip tone={JOB_TONE[status]} label={JOB_STATUS_WORDS[status]} className={className} />;
}
