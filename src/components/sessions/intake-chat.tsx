"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";

import { IntakeChatView, type IntakeView } from "@/components/sessions/intake-chat-view";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function titleFor(slots: IntakeView["intake"]["slots"]) {
  if (slots.market && slots.geography) return `${slots.market}, ${slots.geography}`.slice(0, 80);
  return slots.objective.slice(0, 80) || "Research session";
}

/** The intake chat fed by Convex. Start creates the session's project and run, then opens the session. */
export function IntakeChat({
  workspaceId,
  agentSlug,
  agentName,
  intakeId,
  editor,
  initialText,
}: {
  workspaceId: Id<"workspaces">;
  agentSlug: string;
  agentName: string;
  intakeId: Id<"intakes"> | null;
  editor: boolean;
  initialText?: string;
}) {
  const router = useRouter();
  const view = useQuery(api.intake.get, intakeId ? { workspaceId, intakeId } : "skip");
  const create = useMutation(api.intake.create);
  const reply = useMutation(api.intake.reply);
  const remember = useMutation(api.intake.remember);
  const editPlan = useMutation(api.intake.editPlan);
  const markStarted = useMutation(api.intake.markStarted);
  const createProject = useMutation(api.research.createProject);
  const startRun = useMutation(api.runs.start);
  const base = `/app/agents/${agentSlug}`;

  if (intakeId && view === undefined) return <p className="text-sm text-muted-foreground">Loading the conversation.</p>;
  const current = (view ?? null) as IntakeView | null;

  return (
    <IntakeChatView
      view={current}
      editor={editor}
      agentName={agentName}
      initialText={initialText}
      onFirstMessage={async (text) => {
        const id = await create({ workspaceId, agentSlug, text });
        router.replace(`${base}/sessions/new?intake=${id}`);
      }}
      actions={{
        send: async (text) => {
          if (intakeId) await reply({ workspaceId, intakeId, text });
        },
        remember: async (factKey, yes) => {
          if (intakeId) await remember({ workspaceId, intakeId, factKey, yes });
        },
        removeCompetitor: async (name) => {
          if (intakeId) await editPlan({ workspaceId, intakeId, removeCompetitor: name });
        },
        addCompetitor: async (name) => {
          if (intakeId) await editPlan({ workspaceId, intakeId, addCompetitor: name });
        },
        setPlatforms: async (platforms) => {
          if (intakeId) await editPlan({ workspaceId, intakeId, platforms });
        },
        start: async () => {
          if (!intakeId || !current) return;
          const slots = current.intake.slots;
          const projectId = await createProject({
            workspaceId,
            title: titleFor(slots),
            objective: slots.objective,
            market: slots.market,
            geography: slots.geography,
            competitors: slots.competitors.map((row) => (row.url ? { name: row.name, url: row.url } : { name: row.name })),
            platforms: slots.platforms as ("web" | "youtube" | "tiktok" | "instagram" | "metaAdLibrary")[],
            suppliedUrls: slots.links,
          });
          await startRun({ workspaceId, agentSlug, skillSlug: "market-intelligence", projectId });
          await markStarted({ workspaceId, intakeId, projectId });
          router.push(`${base}/sessions/${projectId}`);
        },
      }}
    />
  );
}
