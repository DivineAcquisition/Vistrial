import type { Metadata } from "next";
import { Suspense } from "react";

import { ConnectionsScreen } from "./connections-screen";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return (
    <Suspense>
      <ConnectionsScreen />
    </Suspense>
  );
}
