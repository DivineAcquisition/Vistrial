import type { ReactNode } from "react";
import {
  AlertTriangle,
  Lock,
  PlugZap,
  SearchX,
  Inbox,
  type LucideIcon,
} from "lucide-react";

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

  const body = (
    <div className="text-center">
      <span
        className={cn(
          "mx-auto grid size-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03]",
          meta.tint
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-4 text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
        {meta.eyebrow}
      </p>
      <p className="mt-2 text-sm font-medium text-white">{title}</p>
      {detail ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-dim">{detail}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );

  if (bare) return <div className={cn("px-6 py-10", className)}>{body}</div>;

  return <Panel className={cn("px-6 py-12", className)}>{body}</Panel>;
}
