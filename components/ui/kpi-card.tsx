import { toneValueClass, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

/**
 * Metric card. The top border is always DA Light Purple; the tone colours the
 * value, never the chrome.
 */
export function KpiCard({
  label,
  value,
  tone = "neutral",
  sub,
  className,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "panel rounded-2xl border-t-2 border-t-brand-500 px-4 py-4",
        className
      )}
    >
      <p className="text-[10px] font-semibold tracking-[0.15em] text-dim uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums",
          toneValueClass(tone)
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-dim">{sub}</p> : null}
    </div>
  );
}

export function KpiGrid({
  children,
  columns = 4,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
}) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];

  return <div className={cn("grid gap-4", cols)}>{children}</div>;
}
