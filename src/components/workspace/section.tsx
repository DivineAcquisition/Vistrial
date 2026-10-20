"use client";

import { ChevronDownIcon, RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { setSectionCollapsedAction } from "@/app/(workspace)/app/home/workspace-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { capCount, STATE_COPY } from "@/lib/workspace/voice";
import { cn } from "@/lib/utils";
import type { SectionId } from "../../../convex/homeRules";

/**
 * One frame for every workspace section: a real heading for screen readers,
 * an optional count, and a collapse choice remembered per person.
 */
export function WorkspaceSection({
  id,
  title,
  count,
  collapsible = true,
  initiallyCollapsed = false,
  actions,
  summary,
  children,
  className,
}: {
  id: SectionId | "crew" | "command";
  title: string;
  count?: number;
  collapsible?: boolean;
  initiallyCollapsed?: boolean;
  actions?: ReactNode;
  /** One line shown while collapsed. */
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const headingId = `ws-${id}`;
  const panelId = `ws-${id}-panel`;

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (id !== "crew" && id !== "command") void setSectionCollapsedAction(id, next);
  }

  return (
    <section id={id} aria-labelledby={headingId} className={cn("flex min-w-0 flex-col gap-3 scroll-mt-24", className)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 id={headingId} className="flex min-w-0 items-center gap-2 font-heading text-base text-card-foreground">
          {collapsible ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-controls={panelId}
              className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
            >
              <ChevronDownIcon aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
              <span className="truncate">{title}</span>
            </button>
          ) : (
            <span className="truncate">{title}</span>
          )}
          {count !== undefined && count > 0 ? (
            <Badge size="sm" variant="default" aria-label={`${count} waiting`}>
              {capCount(count)}
            </Badge>
          ) : null}
        </h2>
        {actions && !collapsed ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {collapsed ? (
        summary ? <div className="text-sm text-muted-foreground">{summary}</div> : null
      ) : (
        <div id={panelId} className="min-w-0">
          {children}
        </div>
      )}
    </section>
  );
}

/** A slow or failed section never breaks the page: it says so and offers a retry. */
export function SectionError({ title }: { title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <section aria-label={title} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-card-foreground">{title}. </span>
        {STATE_COPY.sectionError}
      </p>
      <Button size="sm" variant="outline" loading={pending} onClick={() => start(() => router.refresh())}>
        <RotateCwIcon aria-hidden />
        {STATE_COPY.retry}
      </Button>
    </section>
  );
}

export function SectionSkeleton({ label, rows = 2, tall = false }: { label: string; rows?: number; tall?: boolean }) {
  return (
    <section aria-busy="true" aria-label={`Loading ${label}`} className="flex flex-col gap-3">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn("w-full rounded-xl", tall ? "h-28" : "h-14")} />
      ))}
    </section>
  );
}
