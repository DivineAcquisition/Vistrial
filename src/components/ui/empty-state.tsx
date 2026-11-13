import type { ReactNode } from "react";
import {
  AlertTriangle,
  Lock,
  PackageOpen,
  PlugZap,
  SearchX,
  type LucideIcon,
} from "@/components/icons";

import { AgentScene } from "@/components/agents/agent-scene";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The absences, told apart.
 *
 * Which one it is changes what the reader should do, so they never share a
 * message: nothing has arrived yet, nothing matched a filter, nothing is
 * connected, something broke, or they are not allowed to see it.
 */
export type EmptyKind =
  "unconfigured" | "empty" | "no-results" | "error" | "permission";

/**
 * The shape of what will fill the page, drawn faded with a shimmer so an empty page shows what is coming
 * instead of a blank box: cards (sessions, reports), rows (runs, decisions), facts (memory) or a board.
 */
export type EmptyPreview = "cards" | "rows" | "facts" | "board";

const KIND: Record<EmptyKind, { icon: LucideIcon; tint: string }> = {
  unconfigured: { icon: PlugZap, tint: "text-primary" },
  empty: { icon: PackageOpen, tint: "text-muted-foreground" },
  "no-results": { icon: SearchX, tint: "text-muted-foreground" },
  error: { icon: AlertTriangle, tint: "text-destructive" },
  permission: { icon: Lock, tint: "text-warning" },
};

function GhostCard({ wide = false }: { wide?: boolean }) {
  return (
    <div className="grid content-start gap-2.5 rounded-xl border border-overlay/[0.06] bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-md" />
        <Skeleton className={cn("h-3 rounded", wide ? "w-1/2" : "w-2/5")} />
        <Skeleton className="ml-auto h-4 w-14 rounded-md" />
      </div>
      <Skeleton className="h-3 w-11/12 rounded" />
      <Skeleton className="h-3 w-3/5 rounded" />
    </div>
  );
}

function GhostRow({ width }: { width: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-overlay/[0.06] bg-card/60 px-4 py-3">
      <Skeleton className="size-7 shrink-0 rounded-lg" />
      <div className="grid flex-1 gap-1.5">
        <Skeleton className={cn("h-3 rounded", width)} />
        <Skeleton className="h-2.5 w-1/4 rounded" />
      </div>
      <Skeleton className="h-5 w-16 shrink-0 rounded-md" />
    </div>
  );
}

/** A faded, shimmering sketch of the page's future content. Purely decorative. */
export function GhostPreview({
  preview,
  className,
}: {
  preview: EmptyPreview;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none [mask-image:linear-gradient(to_bottom,black_10%,transparent_95%)] opacity-70",
        className,
      )}
    >
      {preview === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <GhostCard wide />
          <GhostCard />
          <GhostCard />
          <GhostCard />
          <GhostCard wide />
          <GhostCard />
        </div>
      ) : preview === "rows" ? (
        <div className="grid gap-2">
          {["w-2/5", "w-1/2", "w-1/3", "w-2/5", "w-1/2"].map((width, index) => (
            <GhostRow key={index} width={width} />
          ))}
        </div>
      ) : preview === "facts" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-overlay/[0.06] bg-card/60 p-4"
            >
              <Skeleton className="h-2.5 w-1/4 rounded" />
              <Skeleton
                className={cn("h-3.5 rounded", index % 2 ? "w-3/5" : "w-4/5")}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-overlay/[0.06] bg-card/60 p-3"
            >
              <Skeleton className="aspect-video w-full rounded-lg" />
              <Skeleton className="h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  kind = "empty",
  title,
  detail,
  action,
  secondaryAction,
  preview,
  agentLabel,
  className,
  /** Drops the card border, for an empty state already inside one. */
  bare = false,
}: {
  kind?: EmptyKind;
  title: string;
  detail?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Show a faded sketch of what will fill this page. Only for "empty" and "no-results". */
  preview?: EmptyPreview;
  /** The line under the agent visual, e.g. "Strategist is ready". */
  agentLabel?: string;
  className?: string;
  bare?: boolean;
}) {
  const meta = KIND[kind];
  const Icon = meta.icon;
  const ghost =
    preview && (kind === "empty" || kind === "no-results") ? preview : null;

  const message = (
    <Empty
      className={cn(
        "relative gap-4 px-6",
        ghost ? "py-0 md:py-0" : bare ? "py-10 md:py-10" : "py-0 md:py-0",
      )}
    >
      <EmptyHeader>
        {ghost ? (
          <AgentScene label={agentLabel} />
        ) : (
          <EmptyMedia variant="icon">
            <Icon className={meta.tint} aria-hidden="true" />
          </EmptyMedia>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
      </EmptyHeader>
      {action || secondaryAction ? (
        <EmptyContent className="flex-row flex-wrap justify-center">
          {action}
          {secondaryAction}
        </EmptyContent>
      ) : null}
    </Empty>
  );

  if (ghost) {
    // The sketch fills the space; the message sits over its faded lower half.
    return (
      <div
        className={cn(
          "relative grid min-w-0",
          !bare && "rounded-2xl",
          className,
        )}
        data-slot="empty-state"
      >
        <GhostPreview preview={ghost} className="col-start-1 row-start-1" />
        <div className="col-start-1 row-start-1 flex items-end justify-center pt-24 pb-6 sm:items-center sm:pt-0 sm:pb-0">
          <div className="rounded-2xl bg-background/80 px-6 py-6 shadow-[0_0_60px_30px_var(--color-background)] backdrop-blur-[3px]">
            {message}
          </div>
        </div>
      </div>
    );
  }

  if (bare) return <div className={className}>{message}</div>;

  return <Panel className={cn("px-6 py-12", className)}>{message}</Panel>;
}
