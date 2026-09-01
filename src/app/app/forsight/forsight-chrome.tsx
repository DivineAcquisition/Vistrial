import type { ReactNode } from "react";

import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { NavTabs } from "@/components/ui/tabs";
import {
  datasetPromise,
  formatFetchedAt,
  type ForsightView,
} from "@/lib/forsight/dashboard";
import { FORSIGHT_PATH } from "@/lib/navigation";

export const FORSIGHT_PAGES = [
  { href: FORSIGHT_PATH, label: "Weekly Pulse" },
  { href: `${FORSIGHT_PATH}/creatives`, label: "Creative Performance" },
  { href: `${FORSIGHT_PATH}/pipeline`, label: "Pipeline Health" },
  { href: `${FORSIGHT_PATH}/reports`, label: "Reports" },
] as const;

/** Cross-workspace and configuration. Both pages 404 for anyone else. */
export const FORSIGHT_OPERATOR_PAGES = [
  { href: `${FORSIGHT_PATH}/workspaces`, label: "All workspaces" },
  { href: `${FORSIGHT_PATH}/sources`, label: "Sources" },
] as const;

export function ForsightTabs({
  activeHref,
  isPlatformAdmin = false,
}: {
  activeHref: string;
  isPlatformAdmin?: boolean;
}) {
  return (
    <NavTabs
      label="Forsight pages"
      activeHref={activeHref}
      items={[...FORSIGHT_PAGES, ...(isPlatformAdmin ? FORSIGHT_OPERATOR_PAGES : [])]}
    />
  );
}

/**
 * Every Forsight page is the same frame around one of five outcomes. Keeping
 * them in one place is what stops a broken connection from ever rendering as a
 * dashboard full of nothing.
 */
export function ForsightPage<T>({
  activeHref,
  title,
  description,
  view,
  isPlatformAdmin = false,
  children,
}: {
  activeHref: string;
  title: string;
  description: string;
  view: ForsightView<T>;
  isPlatformAdmin?: boolean;
  children: (data: T) => ReactNode;
}) {
  const fetchedAt =
    view.state === "ok" || view.state === "empty"
      ? formatFetchedAt(view.fetchedAt, view.workspace.timezone)
      : null;

  return (
    <PageFrame
      title={title}
      eyebrow={view.workspace.name}
      description={description}
      status={fetchedAt ? `Read at ${fetchedAt}` : undefined}
      statusTone="neutral"
      toolbar={<ForsightTabs activeHref={activeHref} isPlatformAdmin={isPlatformAdmin} />}
    >
      <ForsightBody view={view}>{children}</ForsightBody>
    </PageFrame>
  );
}

function ForsightBody<T>({
  view,
  children,
}: {
  view: ForsightView<T>;
  children: (data: T) => ReactNode;
}) {
  switch (view.state) {
    case "ok":
      return <>{children(view.data)}</>;

    case "empty":
      return (
        <EmptyState
          kind="empty"
          title="Nothing here yet"
          detail={datasetPromise(view.dataset)}
        />
      );

    case "unavailable":
      return <EmptyState kind="unconfigured" title="Not tracked here" detail={view.reason} />;

    case "unconfigured":
      return (
        <EmptyState
          kind="unconfigured"
          title="No metrics source yet"
          detail={`${view.workspace.name} does not have a Forsight source connected. Divine Acquisition connects it — there is nothing for you to enter here.`}
        />
      );

    case "error":
      return (
        <EmptyState
          kind="error"
          title="Could not reach this workspace's data"
          detail={view.message}
        />
      );
  }
}
