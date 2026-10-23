import type { Metadata } from "next";

import { ShellPage } from "@/components/shell/shell-page";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <ShellPage
      eyebrow="Owner and manager"
      title="Team"
      description="People in this workspace, their roles, and the scorecards Helm will keep later."
      emptyTitle="Just you, once you sign in"
      emptyDetail="Inviting a manager or a rep is an owner action. It is not open until sign-in is on."
    />
  );
}
