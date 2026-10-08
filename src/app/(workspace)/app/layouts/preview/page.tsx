import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LayoutPreview } from "@/components/layouts/layout-preview";
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
  searchParams: Promise<{ layout?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) notFound();
  const raw = (await searchParams).layout;
  const kind = raw && KINDS.has(raw as PageLayoutKind) ? (raw as PageLayoutKind) : "standard";
  return <LayoutPreview kind={kind} />;
}
