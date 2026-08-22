import type { Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

const FILL: Record<Tone, string> = {
  brand: "bg-brand-500",
  neutral: "bg-silver",
  good: "bg-flag-good",
  warning: "bg-flag-warning",
  critical: "bg-flag-critical",
};

/**
 * A proportion of a known total. Always announced as a number as well, because
 * a bar on its own tells a screen reader nothing.
 */
export function Progress({
  value,
  max = 100,
  label,
  valueLabel,
  tone = "brand",
  className,
}: {
  value: number;
  max?: number;
  label: string;
  /** Overrides the shown figure, e.g. "8 of 26 fields". */
  valueLabel?: string;
  tone?: Tone;
  className?: string;
}) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max === 0 ? 0 : Math.round((clamped / max) * 100);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs text-silver">{label}</span>
        <span className="text-xs tabular-nums text-dim">{valueLabel ?? `${percent}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", FILL[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
