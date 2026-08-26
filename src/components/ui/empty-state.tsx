import type { ReactNode } from "react";
import {
  AlertTriangle,
  Lock,
  PlugZap,
  SearchX,
  Inbox,
  type LucideIcon,
} from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

/**
 * The absences, told apart.
 *
 * Which one it is changes what the reader should do, so they never share a
 * message: nothing has arrived yet, nothing matched a filter, nothing is
 * connected, something broke, or they are not allowed to see it.
 */
export type EmptyKind = "unconfigured" | "empty" | "no-results" | "error" | "permission";

const KIND: Record<EmptyKind, { eyebrow: string; icon: LucideIcon; tint: string }> = {
  unconfigured: { eyebrow: "Not connected yet", icon: PlugZap, tint: "text-brand-300" },
  empty: { eyebrow: "Nothing to show", icon: Inbox, tint: "text-dim" },
  "no-results": { eyebrow: "No matches", icon: SearchX, tint: "text-dim" },
  error: { eyebrow: "Something went wrong", icon: AlertTriangle, tint: "text-flag-critical" },
  permission: { eyebrow: "Not yours to see", icon: Lock, tint: "text-flag-warning" },
};

export function EmptyState({
  kind = "empty",
  title,
  detail,
  action,
  secondaryAction,
  className,
  /** Drops the card border, for an empty state already inside one. */
  bare = false,
}: {
  kind?: EmptyKind;
  title: string;
  detail?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  bare?: boolean;
}) {
  const meta = KIND[kind];
  const Icon = meta.icon;

  const inner = (
    <>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className={cn("size-5", meta.tint)} aria-hidden />
        </EmptyMedia>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
          {meta.eyebrow}
        </p>
        <EmptyTitle className="text-sm font-medium text-white">{title}</EmptyTitle>
        {detail ? (
          <EmptyDescription className="max-w-md text-sm leading-relaxed text-dim">
            {detail}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action || secondaryAction ? (
        <EmptyContent className="flex-row flex-wrap justify-center">
          {action}
          {secondaryAction}
        </EmptyContent>
      ) : null}
    </>
  );

  if (bare) {
    return (
      <Empty className={cn("gap-4 px-6 py-10 md:py-10", className)}>{inner}</Empty>
    );
  }

  return (
    <Panel className={cn("px-6 py-12", className)}>
      <Empty className="gap-4 px-0 py-0 md:py-0">{inner}</Empty>
    </Panel>
  );
}
