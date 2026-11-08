import {
  AlertTriangle,
  Check,
  CircleDashed,
  Clock3,
  Hourglass,
  LoaderCircle,
  Radio,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

const TONE_VARIANT: Record<Tone, NonNullable<BadgeProps["variant"]>> = {
  brand: "outline",
  neutral: "outline",
  good: "success",
  warning: "warning",
  critical: "error",
};

/** What the tag means, drawn as an icon: work in progress spins, done is a check, waiting is a clock. */
export type StatusIcon =
  | "running"
  | "done"
  | "waiting"
  | "soon"
  | "failed"
  | "stopped"
  | "live"
  | "idle";

const ICONS: Record<StatusIcon, LucideIcon> = {
  running: LoaderCircle,
  done: Check,
  waiting: Clock3,
  soon: Hourglass,
  failed: AlertTriangle,
  stopped: X,
  live: Radio,
  idle: CircleDashed,
};

const TONE_ICON: Record<Tone, StatusIcon> = {
  brand: "live",
  neutral: "idle",
  good: "done",
  warning: "waiting",
  critical: "failed",
};

/** Reads the label so existing call sites get the right icon without changes. */
export function iconFor(label: string, tone: Tone): StatusIcon {
  const text = label.toLowerCase();
  if (/coming soon|planned|soon/.test(text)) return "soon";
  if (
    /running|working|researching|thinking|reading|in progress|queued|starting|checking|writing/.test(
      text,
    )
  )
    return "running";
  if (/fail|error|timed out|broken|reconnect/.test(text)) return "failed";
  if (
    /rejected|stopped|cancel|declined|archived|off\b|not connected|disconnected/.test(
      text,
    )
  )
    return "stopped";
  if (/waiting|needs|review|pending|awaiting|attention|draft/.test(text))
    return "waiting";
  if (
    /complete|done|approved|connected|verified|worked|available|passed|^on$|ready|kept|saved/.test(
      text,
    )
  )
    return "done";
  return TONE_ICON[tone];
}

export function StatusBadge({
  label,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  tone?: Tone;
  /** Override the icon read from the label. */
  icon?: StatusIcon;
  className?: string;
}) {
  const kind = icon ?? iconFor(label, tone);
  const Icon = ICONS[kind];
  return (
    <Badge
      variant={TONE_VARIANT[tone]}
      className={cn(
        "w-fit gap-1.5 rounded-[6px] px-2 font-medium",
        tone === "good" && "text-success",
        tone === "warning" && "text-warning",
        tone === "critical" && "text-destructive",
        tone === "brand" && "border-primary/20 bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-3! opacity-100!",
          kind === "running" && "animate-spin motion-reduce:animate-none",
          kind === "live" && "animate-pulse motion-reduce:animate-none",
        )}
      />
      <span className="capitalize">{label}</span>
    </Badge>
  );
}
