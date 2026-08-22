import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The small in-page states: a note beside a control, a spinner over a region
 * that is refreshing, a caveat on a figure that is only part of the story.
 *
 * A whole-screen absence belongs in `EmptyState`; these are for a state that
 * sits inside a working screen.
 */

export type NoticeTone = "info" | "success" | "warning" | "critical";

const NOTICE: Record<NoticeTone, { border: string; text: string; icon: typeof Info }> = {
  info: { border: "border-white/[0.1]", text: "text-silver", icon: Info },
  success: { border: "border-flag-good/35", text: "text-flag-good", icon: CheckCircle2 },
  warning: { border: "border-flag-warning/40", text: "text-flag-warning", icon: AlertTriangle },
  critical: { border: "border-flag-critical/40", text: "text-flag-critical", icon: AlertTriangle },
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
    <div
      role={tone === "critical" ? "alert" : undefined}
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border bg-white/[0.02] px-4 py-3",
        meta.border,
        className
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", meta.text)} aria-hidden />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title ? <p className={cn("font-medium", meta.text)}>{title}</p> : null}
        {children ? <div className={cn(title ? "mt-1 text-silver" : meta.text)}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
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
          <span className="surface-raised flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-white">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
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
    <div className={cn("flex items-center justify-center gap-2 px-6 py-12 text-sm text-dim", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span role="status">{label}</span>
    </div>
  );
}
