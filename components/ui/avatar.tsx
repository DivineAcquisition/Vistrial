import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-brand-500/25 bg-brand-500/[0.12] font-semibold text-brand-200",
        size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs"
      )}
    >
      {initials(name)}
    </span>
  );
}
