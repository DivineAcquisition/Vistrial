import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Info,
  type LucideIcon,
} from "@/components/icons";

import { cn } from "@/lib/utils";

export type BannerTone = "brand" | "warning" | "critical" | "good" | "neutral";

/** Class strings are written out in full so Tailwind keeps them. */
const TONE: Record<
  BannerTone,
  { frame: string; wash: string; tile: string; title: string; icon: LucideIcon }
> = {
  brand: {
    frame: "border-primary/25",
    wash: "from-primary/14 via-primary/5 to-transparent",
    tile: "border-primary/25 text-primary",
    title: "text-primary",
    icon: Info,
  },
  warning: {
    frame: "border-warning/30",
    wash: "from-warning/16 via-warning/5 to-transparent",
    tile: "border-warning/30 text-warning",
    title: "text-warning",
    icon: Clock3,
  },
  critical: {
    frame: "border-destructive/30",
    wash: "from-destructive/14 via-destructive/5 to-transparent",
    tile: "border-destructive/30 text-destructive",
    title: "text-destructive",
    icon: AlertTriangle,
  },
  good: {
    frame: "border-success/30",
    wash: "from-success/14 via-success/5 to-transparent",
    tile: "border-success/30 text-success",
    title: "text-success",
    icon: CheckCircle2,
  },
  neutral: {
    frame: "border-border",
    wash: "from-overlay/[0.06] via-overlay/[0.02] to-transparent",
    tile: "border-border text-muted-foreground",
    title: "text-card-foreground",
    icon: Info,
  },
};

/**
 * A notice that needs to be seen: a soft gradient wash with a faint grid, an icon tile, a title, one line and
 * an optional action. Replaces the plain tinted boxes for waiting, assumed, reconnecting and limit notices.
 */
export function Banner({
  tone = "brand",
  icon,
  title,
  children,
  action,
  role = "status",
  className,
  compact = false,
}: {
  tone?: BannerTone;
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: "status" | "alert" | "note";
  className?: string;
  /** Smaller padding and tile, for notices inside cards. */
  compact?: boolean;
}) {
  const look = TONE[tone];
  const Icon = look.icon;
  return (
    <div
      role={role === "note" ? undefined : role}
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border bg-card",
        look.frame,
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn("absolute inset-0 -z-10 bg-gradient-to-r", look.wash)}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_right,black,transparent_75%)] opacity-60 [background-image:linear-gradient(to_right,var(--color-overlay)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-overlay)_1px,transparent_1px)] [background-size:18px_18px] [--color-overlay:color-mix(in_oklab,currentColor_9%,transparent)]"
      />
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl border bg-background/80 shadow-sm backdrop-blur",
            look.tile,
            compact ? "size-8 [&_svg]:size-4" : "size-10 [&_svg]:size-5",
          )}
        >
          {icon ?? <Icon aria-hidden />}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className={cn("text-sm font-medium", look.title)}>{title}</p>
          {children ? (
            <div className="text-sm text-muted-foreground">{children}</div>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
