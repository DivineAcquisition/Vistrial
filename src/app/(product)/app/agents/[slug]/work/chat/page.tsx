"use client";

import { canWork } from "@/lib/roles";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AgentChat, contextFromQuery } from "@/components/chat/agent-chat";
import { DealmakerChat } from "@/components/work/dealmaker-chat";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { WorkGate } from "@/components/work/work-gate";
import type { Id } from "../../../../../../../../convex/_generated/dataModel";

function Chat() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  // Dealmaker has its own chat (its own routes and plans); Strategist's is unchanged.
  if (params.slug === "sales-conversion") {
    return (
      <WorkGate agent={agent}>
        <DealmakerChat workspaceId={shell.workspaceId} base={`/app/agents/${params.slug}`} editor={canWork(shell.role) && agent?.state !== "off"} />
      </WorkGate>
    );
  }
  return (
    <WorkGate agent={agent}>
      <AgentChat
        workspaceId={shell.workspaceId}
        base={`/app/agents/${params.slug}`}
        slug={params.slug}
        agentName={agent?.name ?? "Strategist"}
        editor={canWork(shell.role) && agent?.state !== "off"}
        conversationId={(query.get("c") ?? query.get("intake")) as Id<"intakes"> | null}
        skill={query.get("skill")}
        ask={query.get("ask") ?? query.get("objective") ?? undefined}
        context={contextFromQuery(query.get("ref"), query.get("about"))}
      />
    </WorkGate>
  );
}

/** The Chat tab: the one place to talk to the agent, with past conversations beside the open one. */
export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}
