import { ShellPage } from "@/components/shell/shell-page";

export const metadata = { title: "Briefing" };

/** The Briefing. Posts are already being written; the feed itself arrives in a later change. */
export default function BriefingPage() {
  return (
    <ShellPage
      eyebrow="Briefing"
      title="Briefing"
      description="Approvals waiting for you, finished work, alerts, drafts to review and your weekly growth report, in one feed."
      emptyTitle="The feed is being built."
      emptyDetail="Until then, what needs you is on Home, and drafts are on each agent's work tabs."
    />
  );
}
