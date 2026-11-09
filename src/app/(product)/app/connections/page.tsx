import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ConnectionsScreen } from "./connections-screen";

export const metadata: Metadata = { title: "Connections" };

/** Connections live under Settings → Data. Facebook Login still returns here with ?meta=, carried on to the Meta page. */
export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (!query.meta) redirect("/app/settings?section=data");
  return (
    <Suspense>
      <ConnectionsScreen />
    </Suspense>
  );
}
