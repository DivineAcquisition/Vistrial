import type { ReactNode } from "react";

import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/components/ui/tone";
import { eyebrow as eyebrowClass, pageTitle } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * The top of every page.
 *
 * Title, what the page is for, where it sits, what state it is in, and what you
 * can do from here — in that order, in one place, so the answer to "what am I
 * looking at" never moves between screens.
 *
 * `toolbar` holds tabs or filters that belong to the page rather than to one
 * card, and sits under a rule so the page body starts cleanly beneath it.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  status,
  statusTone = "neutral",
  actions,
  secondaryActions,
  toolbar,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  status?: string;
  statusTone?: Tone;
  /** The page's primary action. One, on the right. */
  actions?: ReactNode;
  /** Quieter actions, placed before the primary one. */
  secondaryActions?: ReactNode;
  /** Tabs, filters or a range picker belonging to the whole page. */
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <Breadcrumbs items={breadcrumbs} className="mb-3" />
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className={cn(eyebrowClass, "mb-4")}>{eyebrow}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={pageTitle}>{title}</h1>
            {status ? <StatusBadge label={status} tone={statusTone} /> : null}
          </div>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-silver">{description}</p>
          ) : null}
        </div>

        {actions || secondaryActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {secondaryActions}
            {actions}
          </div>
        ) : null}
      </div>

      {toolbar ? (
        <div className="mt-6 border-t border-white/[0.07] pt-5">{toolbar}</div>
      ) : null}
    </header>
  );
}
