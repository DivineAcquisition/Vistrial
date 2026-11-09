import type { Metadata } from "next";
import { Suspense } from "react";

import { JoinWorkspace } from "./join-workspace";

export const metadata: Metadata = { title: "Join a workspace", robots: { index: false, follow: false } };

export default function JoinPage() {
  return (
    <Suspense>
      <JoinWorkspace />
    </Suspense>
  );
}
