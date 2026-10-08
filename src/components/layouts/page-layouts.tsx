import type { ReactNode } from "react";

import { pageStack } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * The eight page layouts. A later screen picks one and passes its content.
 * Spacing comes from the shared scale (`pageStack`, the 4 / 8 steps).
 */

export function StandardPage({
  header,
  children,
  width = "reading",
}: {
  header?: ReactNode;
  children: ReactNode;
  /** `reading` for a form. `content` keeps the wide measure used by current pages. */
  width?: "reading" | "content";
}) {
  return (
    <div className={cn("mx-auto w-full min-w-0", width === "reading" ? "max-w-3xl" : "max-w-[1400px]", pageStack)}>
      {header}
      {children}
    </div>
  );
}

export function DashboardPage({
  header,
  stats,
  children,
}: {
  header?: ReactNode;
  stats?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full min-w-0 max-w-[1400px]", pageStack)}>
      {header}
      {stats ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats}</div> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  );
}

export function ListDetailPage({
  header,
  list,
  detail,
  detailOpen = false,
  back,
}: {
  header?: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  /** On a small screen, the detail replaces the list until Back. */
  detailOpen?: boolean;
  back?: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full min-w-0 max-w-[1400px]", pageStack)}>
      {header}
      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
        <div className={cn("min-w-0 lg:w-80 lg:shrink-0", detailOpen && "hidden lg:block")}>{list}</div>
        <div className={cn("min-w-0 flex-1", !detailOpen && "hidden lg:block")}>
          {back ? <div className="mb-4 lg:hidden">{back}</div> : null}
          {detail}
        </div>
      </div>
    </div>
  );
}

export function FullWidthTablePage({
  header,
  filters,
  table,
  cards,
}: {
  header?: ReactNode;
  filters?: ReactNode;
  table: ReactNode;
  /** Replaces the table on a phone. */
  cards: ReactNode;
}) {
  return (
    <div className={cn("w-full min-w-0 max-w-none", pageStack)}>
      {header}
      {filters ? (
        <div className="sticky top-0 z-20 -mx-5 bg-background/90 px-5 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
          {filters}
        </div>
      ) : null}
      <div className="hidden min-w-0 md:block">{table}</div>
      <div className="grid min-w-0 gap-3 md:hidden">{cards}</div>
    </div>
  );
}

export function RecordPage({
  header,
  tabs,
  children,
  aside,
}: {
  header?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full min-w-0 max-w-[1400px]", pageStack)}>
      {header}
      {tabs}
      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">{children}</div>
        {aside ? <aside className="min-w-0 lg:w-80 lg:shrink-0">{aside}</aside> : null}
      </div>
    </div>
  );
}

export function WorkflowPage({
  progress,
  children,
  footer,
}: {
  progress?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8">
      {progress}
      <div className="min-w-0 flex-1">{children}</div>
      {footer ? (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-5 border-t border-border bg-background/90 px-5 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8 md:bottom-0 lg:-mx-10 lg:px-10">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function ChatPage({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col lg:flex-row">
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
      {aside ? (
        <aside className="min-h-0 min-w-0 border-t border-border lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l">
          {aside}
        </aside>
      ) : null}
    </div>
  );
}

export function MessagePage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full min-w-0 max-w-md items-center justify-center">
      {children}
    </div>
  );
}
