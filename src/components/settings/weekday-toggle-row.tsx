import { WEEKDAY_LABELS } from "@/lib/notifications/labels";
import { cn } from "@/lib/utils";

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Seven day chips in one row. Native checkboxes so the existing form action still works. */
export function WeekdayToggleRow({
  name = "working_days",
  selected,
}: {
  name?: string;
  selected: number[];
}) {
  return (
    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
      {DAYS.map((day) => (
        <label
          key={day}
          className={cn(
            "relative flex h-9 min-w-0 cursor-pointer items-center justify-center rounded-xl border px-0.5 text-[10px] font-medium tracking-wide transition-colors sm:h-10 sm:text-xs",
            "border-white/[0.09] bg-ink-850 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
            "hover:border-white/[0.16] hover:text-card-foreground",
            "has-[:checked]:border-brand-400/70 has-[:checked]:bg-brand-500/18 has-[:checked]:text-foreground",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-background",
          )}
        >
          <input
            type="checkbox"
            name={name}
            value={String(day)}
            defaultChecked={selected.includes(day)}
            className="sr-only"
          />
          {WEEKDAY_LABELS[day]}
        </label>
      ))}
    </div>
  );
}
