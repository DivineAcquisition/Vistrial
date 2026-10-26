"use client";

import { ProfileEditor } from "@/components/profile/profile-editor";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { PageHeader } from "@/components/ui/page-header";

export default function ProfilePage() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Business profile"
        description="Agents read the confirmed version. An edit opens a new draft and keeps the old one."
      />
      <ProfileEditor workspaceId={shell.workspaceId} role={shell.role} />
    </div>
  );
}
