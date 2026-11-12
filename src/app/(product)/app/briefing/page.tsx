import { Briefing } from "@/components/briefing/briefing-feed";

export const metadata = { title: "Briefing" };

/** The Briefing: approvals, drafts, finished work, alerts and the weekly growth report, in one feed. */
export default function BriefingPage() {
  return <Briefing />;
}
