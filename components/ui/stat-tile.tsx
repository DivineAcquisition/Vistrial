import { cn } from "@/lib/utils";
import { toneValueClass, type Tone } from "@/components/ui/tone";

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="bg-ink-950/85 px-4 py-4">
      <p className="text-[10px] font-semibold tracking-[0.14em] text-neutral-500 uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-xl font-semibold tabular-nums",
          toneValueClass(tone)
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs leading-snug text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Grid wrapper that gives StatTile children their hairline dividers. */
export function StatGrid({
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

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06]",
        cols
      )}
    >
      {children}
    </dl>
  );
}
