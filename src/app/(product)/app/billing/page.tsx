import type { Metadata } from "next";
import { Suspense } from "react";

import { BillingScreen } from "@/components/billing/billing-screen";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <Suspense>
      <BillingScreen />
    </Suspense>
  );
}
