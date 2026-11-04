"use client";

import { AssignmentForm } from "@/components/research/assignment-form";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function NewAssignmentPage() {
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Growth Architect · Market Intelligence"
        title="New assignment"
        description="Say what you want to find out. The agent reads your context, studies the market, and returns three opportunities with the evidence behind each."
      />
      <AssignmentForm workspaceId={shell.workspaceId} canStart={shell.role !== "rep"} />
    </div>
  );
}
