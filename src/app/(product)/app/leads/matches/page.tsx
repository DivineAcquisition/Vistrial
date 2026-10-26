import type { Metadata } from "next";

import { MatchReview } from "@/components/leads/match-review";

export const metadata: Metadata = { title: "Review matches" };

export default function MatchesPage() {
  return <MatchReview />;
}
