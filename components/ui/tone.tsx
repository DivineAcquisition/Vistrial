import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status vocabulary ported from the Divine Acquisition repo. Brand purple stays
 * the action colour; the flag tones carry meaning a single hue cannot express.
 */
export type Tone = "brand" | "neutral" | "good" | "warning" | "critical";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "border-brand-500/30 bg-brand-500/[0.12] text-brand-200",
  neutral: "border-border bg-white/[0.04] text-dim",
  good: "border-flag-good/30 bg-flag-good/[0.12] text-flag-good",
  warning: "border-flag-warning/30 bg-flag-warning/[0.12] text-flag-warning",
  critical: "border-flag-critical/30 bg-flag-critical/[0.12] text-flag-critical",
};

const DOT_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-500",
  neutral: "bg-dim",
  good: "bg-flag-good",
  warning: "bg-flag-warning",
  critical: "bg-flag-critical",
};

const VALUE_CLASSES: Record<Tone, string> = {
  brand: "text-brand-300",
  neutral: "text-white",
  good: "text-flag-good",
  warning: "text-flag-warning",
  critical: "text-flag-critical",
};

export function toneValueClass(tone: Tone): string {
  return VALUE_CLASSES[tone];
}

export function TonePill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "brand" }: { tone?: Tone }) {
  return (
    <span
      aria-hidden
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASSES[tone])}
    />
  );
}

export function Meter({ value, tone = "brand" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          DOT_CLASSES[tone]
        )}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

/** Compliance colouring used consistently wherever a rate is shown. */
export function rateTone(rate: number): Tone {
  if (rate >= 0.9) return "good";
  if (rate >= 0.75) return "warning";
  return "critical";
}

export function RatePill({ rate, label }: { rate: number; label?: string }) {
  return (
    <TonePill tone={rateTone(rate)}>
      {formatPercent(rate)}
      {label ? ` ${label}` : ""}
    </TonePill>
  );
}
