import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LayoutReference } from "@/components/layouts/layout-reference";
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
  searchParams: Promise<{ layout?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) notFound();
  const raw = (await searchParams).layout;
  const kind = raw && KINDS.has(raw as PageLayoutKind) ? (raw as PageLayoutKind) : "standard";
  return <LayoutReference kind={kind} />;
}
