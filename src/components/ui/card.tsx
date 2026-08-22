import type { ElementType, ReactNode } from "react";

import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/components/ui/tone";
import { cardTitle, helperClass, surfacePad, type SurfacePad } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * The card system.
 *
 * A card earns its border by grouping things that belong together. Where plain
 * page spacing would say the same thing, use the spacing: a page of nested
 * boxes reads as a page of nothing.
 *
 * Everything here renders the same `.panel` surface the app already uses, so a
 * screen can adopt `Card` one section at a time without a visible seam.
 */

export type CardTone = "default" | "warning" | "critical" | "brand";

const TONE_BORDER: Record<CardTone, string> = {
  default: "",
  brand: "border-brand-500/35",
  warning: "border-flag-warning/40",
  critical: "border-flag-critical/40",
};

export function Card({
  children,
  className,
  pad = "default",
  tone = "default",
  interactive = false,
  as,
}: {
  children: ReactNode;
  className?: string;
  pad?: SurfacePad;
  tone?: CardTone;
  /** Adds hover feedback. Only for a card that is itself a link or a button. */
  interactive?: boolean;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Panel
      as={as}
      className={cn(
        surfacePad[pad],
        TONE_BORDER[tone],
        interactive && "panel-hover",
        className
      )}
    >
      {children}
    </Panel>
  );
}

/**
 * A card's title row: name on the left, status and actions on the right.
 * Every card title in the app is this one size, so they stop competing.
 */
export function CardHeader({
  title,
  description,
  status,
  statusTone = "neutral",
  actions,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  status?: string;
  statusTone?: Tone;
  actions?: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <Heading className={cardTitle}>{title}</Heading>
        {description ? <p className={helperClass}>{description}</p> : null}
      </div>
      {status || actions ? (
        <div className="flex shrink-0 items-center gap-2">
          {status ? <StatusBadge label={status} tone={statusTone} /> : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** The gap between a card's header and its contents. */
export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("mt-5", className)}>{children}</div>;
}

/** Actions pinned under a rule at the foot of a card. */
export function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-5",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * A card whose whole point is one action: an integration to connect, a report
 * to generate, a stage to start.
 */
export function ActionCard({
  title,
  description,
  action,
  icon,
  status,
  statusTone = "neutral",
  tone = "default",
  className,
}: {
  title: string;
  description?: string;
  action: ReactNode;
  icon?: ReactNode;
  status?: string;
  statusTone?: Tone;
  tone?: CardTone;
  className?: string;
}) {
  return (
    <Card tone={tone} className={cn("flex flex-wrap items-center gap-x-5 gap-y-4", className)}>
      {icon ? (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-brand-300">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cardTitle}>{title}</h3>
          {status ? <StatusBadge label={status} tone={statusTone} /> : null}
        </div>
        {description ? <p className={helperClass}>{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{action}</div>
    </Card>
  );
}
