import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LayoutPreview } from "@/components/layouts/layout-preview";
import { isLayoutState } from "@/components/layouts/layout-states";
import { getAuthContext } from "@/lib/auth/session";
import type { PageLayoutKind } from "@/lib/shell/nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Layout preview",
  robots: { index: false, follow: false },
};

const KINDS = new Set<PageLayoutKind>([
  "standard",
  "dashboard",
  "list-detail",
  "table",
  "record",
  "workflow",
  "chat",
  "message",
]);

/** Rendered inside a sized frame. The outer shell steps aside so this is the only shell. */
export default async function LayoutPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ layout?: string; state?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) notFound();
  const query = await searchParams;
  const kind = query.layout && KINDS.has(query.layout as PageLayoutKind) ? (query.layout as PageLayoutKind) : "standard";
  const state = isLayoutState(query.state) ? query.state : "ready";
  return <LayoutPreview kind={kind} state={state} />;
}
