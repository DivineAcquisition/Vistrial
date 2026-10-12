import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { CoachesOffer } from "@/components/marketing/coaches";
import { COACHES } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: "For coaches",
  description: COACHES.subhead,
};

export default function CoachesPage() {
  return (
    <MarketingShell>
      <CoachesOffer />
    </MarketingShell>
  );
}
