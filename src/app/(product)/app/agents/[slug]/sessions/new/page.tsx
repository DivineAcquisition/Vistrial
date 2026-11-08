"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { IntakeChat } from "@/components/sessions/intake-chat";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Panel } from "@/components/ui/panel";
import type { Id } from "../../../../../../../../convex/_generated/dataModel";

function NewSession() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  if (params.slug !== "growth-architect") {
    return (
      <Panel className="p-5">
        <p className="text-sm text-muted-foreground">{agent?.name ?? "This agent"} does not run sessions yet.</p>
      </Panel>
    );
  }
  const intakeId = query.get("intake") as Id<"intakes"> | null;
  return (
    <IntakeChat
      key={intakeId ?? "new"}
      workspaceId={shell.workspaceId}
      agentSlug={params.slug}
      agentName={agent?.name ?? "Growth Architect"}
      intakeId={intakeId}
      editor={shell.role !== "rep" && agent?.state !== "off"}
      initialText={query.get("objective") ?? ""}
    />
  );
}

export default function NewSessionPage() {
  return (
    <Suspense>
      <NewSession />
    </Suspense>
  );
}
