import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LayoutReference } from "@/components/layouts/layout-reference";
import { isLayoutState } from "@/components/layouts/layout-states";
import { getAuthContext } from "@/lib/auth/session";
import type { PageLayoutKind } from "@/lib/shell/nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Layouts",
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

export default async function LayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ layout?: string; state?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) notFound();
  const query = await searchParams;
  const kind = query.layout && KINDS.has(query.layout as PageLayoutKind) ? (query.layout as PageLayoutKind) : "standard";
  const state = isLayoutState(query.state) ? query.state : "ready";
  return <LayoutReference kind={kind} state={state} />;
}
