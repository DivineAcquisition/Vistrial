import { ShellPage } from "@/components/shell/shell-page";

export const metadata = { title: "Tasks" };

/** The Tasks board. The data and rules are in place; the board itself arrives in the next change. */
export default function TasksPage() {
  return (
    <ShellPage
      eyebrow="Tasks"
      title="Tasks"
      description="Work your agents propose, with what each is expected to return, what it would cost in credits and the evidence behind it. You approve; agents do the work."
      emptyTitle="The board is being built."
      emptyDetail="Proposed tasks will appear here in columns: Proposed, Approved, Running, Needs you, Done and Result."
    />
  );
}
