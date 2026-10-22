import { notFound } from "next/navigation";

import { AgentGlyph } from "@/components/live/agent-identity";
import { AvatarCustomStylesDemo } from "@/components/ui/heroui-avatar-demo";
import { AGENTS, LIVE_AGENT_IDS } from "@/lib/agents/roster";

export const dynamic = "force-dynamic";

/** Development only. The avatar styles, and the faces the agents wear. */
export default function AvatarPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-background">
      <AvatarCustomStylesDemo />
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-8 pb-16">
        <h1 className="text-sm font-medium text-muted-foreground">Agents</h1>
        <ul className="flex flex-wrap items-end justify-center gap-6">
          {LIVE_AGENT_IDS.map((id) => (
            <li key={id} className="flex flex-col items-center gap-2">
              <AgentGlyph agentId={id} size="lg" working={id === "compass"} />
              <span className="text-xs text-muted-foreground">{AGENTS[id].name}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
