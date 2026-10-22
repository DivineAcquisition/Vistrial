import { notFound } from "next/navigation";

import { LayoutSample } from "@/components/layouts/layout-samples";
import { isLayoutState } from "@/components/layouts/layout-states";
import { PreviewShell } from "@/components/preview/preview-shell";
import type { PageLayoutKind } from "@/lib/shell/nav";

export const dynamic = "force-dynamic";

const KINDS = new Set<PageLayoutKind>(["standard", "dashboard", "list-detail", "table", "record", "workflow", "chat", "message"]);

/**
 * Development only: the app shell and one sample page layout, with no signed-in
 * workspace, for checking both themes at every width.
 */
export default async function LayoutsPreviewPage({ searchParams }: { searchParams: Promise<{ layout?: string; state?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const kind = query.layout && KINDS.has(query.layout as PageLayoutKind) ? (query.layout as PageLayoutKind) : "dashboard";
  const state = isLayoutState(query.state) ? query.state : "ready";
  return (
    <PreviewShell title="Layout preview" chat={kind === "chat"}>
      <LayoutSample kind={kind} state={state} />
    </PreviewShell>
  );
}
