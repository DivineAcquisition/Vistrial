"use client";

import { canWork, isAdmin } from "@/lib/roles";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { useChatExtras } from "@/components/chat/use-chat-extras";
import { useWorkspaceShell, useClientScope } from "@/components/shell/shell-context";
import { api } from "../../../convex/_generated/api";
import { showError } from "@/lib/errors/show-error";

/**
 * The chat box on Home: pick the agent and the quality, add files, links or a focus, and send. It opens a
 * new conversation in that agent's Chat tab, routed to the skill the message is for.
 */
type StartChatProps = { defaultAgent?: string; size?: "hero" | "dock" | "compact"; placeholder?: string; initialText?: string };

export function StartChat(props: StartChatProps) {
  const shell = useWorkspaceShell();
  return shell ? <StartChatInner {...props} /> : null;
}

function StartChatInner({ defaultAgent = "growth-architect", size = "dock", placeholder = "What should Vistrial work on?", initialText }: StartChatProps) {
  const shell = useWorkspaceShell();
  const router = useRouter();
  const send = useMutation(api.agentChat.send);
  const { clientId } = useClientScope();
  const [agentSlug, setAgentSlug] = useState(defaultAgent);
  const [problem, setProblem] = useState("");
  const extras = useChatExtras(shell!.workspaceId, shell ? canWork(shell.role) : false, shell ? isAdmin(shell.role) : false);
  if (!shell) return null;
  const options = shell.agents.map((row) => ({ slug: row.slug, name: row.name, live: row.status === "live" && row.slug === "growth-architect" }));
  const chosen = options.find((row) => row.slug === agentSlug && row.live) ? agentSlug : "growth-architect";
  const canStart = canWork(shell.role);

  return (
    <div className="grid gap-1">
      <ChatComposer
        size={size}
        placeholder={canStart ? placeholder : "Owners, Admins and Members start sessions."}
        initialText={initialText}
        disabled={!canStart}
        agent={{ value: chosen, options, onChange: setAgentSlug }}
        {...extras.composer}
        footnote={
          size === "hero"
            ? "Vistrial asks only what it needs, then shows a plan with its budget. Nothing runs or spends until you press Start."
            : undefined
        }
        onSubmit={async (text) => {
          setProblem("");
          try {
            // Routed in code to the skill it is for; when unclear, the chat asks which.
            const { intakeId, route } = await send({
              workspaceId: shell.workspaceId,
              text,
              mode: extras.mode,
              ...(extras.sources ? { platforms: extras.sources } : {}),
              ...(extras.links.length ? { links: extras.links } : {}),
              // A new conversation is about whoever the picker is on.
              ...(clientId ? { clientId } : {}),
            });
            if (route === "market-intelligence") await extras.attachTo({ intakeId });
            extras.reset();
            router.push(`/app/agents/${chosen}/work/chat?c=${intakeId}`);
          } catch (error) {
            setProblem(showError(error, "That did not start."));
            throw error;
          }
        }}
      />
      {problem || extras.problem ? <p className="px-1 text-xs text-destructive">{problem || extras.problem}</p> : null}
    </div>
  );
}
