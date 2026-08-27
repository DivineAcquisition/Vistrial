import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * The small in-page states: a note beside a control, a spinner over a region
 * that is refreshing, a caveat on a figure that is only part of the story.
 *
 * A whole-screen absence belongs in `EmptyState`; these are for a state that
 * sits inside a working screen.
 */

export type NoticeTone = "info" | "success" | "warning" | "critical";

const NOTICE: Record<
  NoticeTone,
  { variant: "info" | "success" | "warning" | "error"; icon: typeof Info }
> = {
  info: { variant: "info", icon: Info },
  success: { variant: "success", icon: CheckCircle2 },
  warning: { variant: "warning", icon: AlertTriangle },
  critical: { variant: "error", icon: AlertTriangle },
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const meta = NOTICE[tone];
  const Icon = meta.icon;

  return (
    <Alert variant={meta.variant} className={className}>
      <Icon />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {children ? <AlertDescription>{children}</AlertDescription> : null}
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  );
}

/** A region that is refreshing but still shows the figures it already had. */
export function LoadingOverlay({
  label = "Loading",
  children,
  active,
  className,
}: {
  label?: string;
  children: ReactNode;
  active: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)} aria-busy={active || undefined}>
      <div className={cn(active && "pointer-events-none opacity-40 transition-opacity")}>
        {children}
      </div>
      {active ? (
        <div className="absolute inset-0 grid place-items-center">
          <span className="inline-flex items-center gap-2 rounded-lg border border-input bg-popover px-3.5 py-1.5 text-xs text-card-foreground shadow-xs/5">
            <Spinner className="size-3.5" />
            {label}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** A spinner with a label, for a region with nothing to show yet. */
export function LoadingRegion({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground", className)}>
      <Spinner className="size-4" />
      <span role="status">{label}</span>
    </div>
  );
}
