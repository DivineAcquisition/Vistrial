import { TonePill } from "@/components/ui/tone";
import { toneValueClass } from "@/components/ui/tone";
import { AWAITING, formatDuration, responseTone } from "@/lib/response-time";
import { cn } from "@/lib/utils";

/**
 * A response time that was never measured is "awaiting", never zero. The two
 * mean opposite things and only one of them is a number.
 */
export function ResponseValue({
  ms,
  className,
}: {
  ms: number | null;
  className?: string;
}) {
  if (ms === null) {
    return <TonePill tone="critical">{AWAITING}</TonePill>;
  }

  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        toneValueClass(responseTone(ms)),
        className
      )}
    >
      {formatDuration(ms)}
    </span>
  );
}
