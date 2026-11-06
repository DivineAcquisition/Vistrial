"use client";

import { useParams } from "next/navigation";

import { ConnectionList } from "@/components/connections/connection-list";
import { useWorkspaceShell } from "@/components/shell/shell-context";

export default function AgentConnections() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  return <ConnectionList workspaceId={shell.workspaceId} agentSlug={params.slug} />;
}
