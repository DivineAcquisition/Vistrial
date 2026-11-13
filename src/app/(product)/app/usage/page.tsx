import type { Metadata } from "next";
import { Suspense } from "react";

import { UsageScreen } from "@/components/usage/usage-screen";

export const metadata: Metadata = { title: "Usage" };

export default function UsagePage() {
  return (
    <Suspense>
      <UsageScreen />
    </Suspense>
  );
}
