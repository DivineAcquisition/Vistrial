import { cn } from "@/lib/utils";

export function RemainingCount({
  value,
  max,
  className,
}: {
  value: string;
  max: number;
  className?: string;
}) {
  const left = Math.max(0, max - value.length);
  return (
    <p className={cn("mt-1 text-xs text-muted-foreground", className)}>
      <span className="tabular-nums">{left}</span> characters left
    </p>
  );
}
