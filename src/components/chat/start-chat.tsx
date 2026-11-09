"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { useChatExtras } from "@/components/chat/use-chat-extras";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { api } from "../../../convex/_generated/api";
import { showError } from "@/lib/errors/show-error";

/**
 * The chat box that starts work from anywhere: pick the agent and the quality, add files, links or a focus,
 * and send. It opens a new session conversation with that agent.
 */
type StartChatProps = { defaultAgent?: string; size?: "hero" | "dock" | "compact"; placeholder?: string; initialText?: string };

export function StartChat(props: StartChatProps) {
  const shell = useWorkspaceShell();
  return shell ? <StartChatInner {...props} /> : null;
}

function StartChatInner({ defaultAgent = "growth-architect", size = "dock", placeholder = "What should Vistrial work on?", initialText }: StartChatProps) {
  const shell = useWorkspaceShell();
  const router = useRouter();
  const create = useMutation(api.intake.create);
  const [agentSlug, setAgentSlug] = useState(defaultAgent);
  const [problem, setProblem] = useState("");
  const extras = useChatExtras(shell!.workspaceId, shell?.role !== "rep", shell?.role === "owner");
  if (!shell) return null;
  const options = shell.agents.map((row) => ({ slug: row.slug, name: row.name, live: row.status === "live" && row.slug === "growth-architect" }));
  const chosen = options.find((row) => row.slug === agentSlug && row.live) ? agentSlug : "growth-architect";
  const canStart = shell.role !== "rep";

  return (
    <div className="grid gap-1">
      <ChatComposer
        size={size}
        placeholder={canStart ? placeholder : "Owners and Managers start sessions."}
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
            const intakeId = await create({
              workspaceId: shell.workspaceId,
              agentSlug: chosen,
              text,
              mode: extras.mode,
              ...(extras.sources ? { platforms: extras.sources } : {}),
              ...(extras.links.length ? { links: extras.links } : {}),
            });
            await extras.attachTo({ intakeId });
            extras.reset();
            router.push(`/app/agents/${chosen}/work/research?intake=${intakeId}`);
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
