import type { Metadata } from "next";

import { ShellPage } from "@/components/shell/shell-page";

export const metadata: Metadata = { title: "My day" };

export default function MyDayPage() {
  return (
    <ShellPage
      eyebrow="Rep"
      title="My day"
      description="The ranked list for the leads assigned to you, with a draft ready."
      emptyTitle="No one to contact yet"
      emptyDetail="When leads are assigned to you, the first person to call shows up here with a draft."
    />
  );
}
