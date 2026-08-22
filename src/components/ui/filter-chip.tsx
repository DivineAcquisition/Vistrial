import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * An applied filter, shown so it can be seen and removed. A filter you cannot
 * see is the usual reason a list looks empty for no apparent reason.
 */
export function FilterChip({
  label,
  value,
  onRemove,
  removeLabel,
  className,
}: {
  label: string;
  value: string;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/[0.1] py-1 pl-3 text-[13px] text-brand-200",
        onRemove ? "pr-1" : "pr-3",
        className
      )}
    >
      <span className="text-brand-300/70">{label}</span>
      <span className="text-white">{value}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${label} filter`}
          className="grid size-5 place-items-center rounded-full text-brand-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
