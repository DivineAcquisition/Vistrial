"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatComposer, type ComposerFile } from "@/components/chat/chat-composer";
import { StartChat } from "@/components/chat/start-chat";
import { IntakeChatView, type IntakeView } from "@/components/sessions/intake-chat-view";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { money } from "@/lib/research/words";
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
  const shell = useWorkspaceShell();
  const view = useQuery(api.intake.get, intakeId ? { workspaceId, intakeId } : "skip");
  const fileRows = useQuery(api.files.list, intakeId ? { workspaceId, intakeId } : "skip");
  const meta = useQuery(api.metaAds.status, { workspaceId });
  const reply = useMutation(api.intake.reply);
  const remember = useMutation(api.intake.remember);
  const editPlan = useMutation(api.intake.editPlan);
  const setMode = useMutation(api.intake.setMode);
  const markStarted = useMutation(api.intake.markStarted);
  const createProject = useMutation(api.research.createProject);
  const startRun = useMutation(api.runs.start);
  const uploadUrl = useMutation(api.files.uploadUrl);
  const attach = useMutation(api.files.attach);
  const removeFile = useMutation(api.files.remove);
  const startConnect = useMutation(api.metaAds.startConnect);
  const [uploading, setUploading] = useState<ComposerFile[]>([]);
  const [problem, setProblem] = useState("");
  const base = `/app/agents/${agentSlug}`;

  if (intakeId && view === undefined) return <p className="text-sm text-muted-foreground">Loading the conversation.</p>;
  const current = (view ?? null) as IntakeView | null;

  // A new conversation starts from the same chat box used everywhere else.
  if (!current || !intakeId) {
    return (
      <IntakeChatView
        view={null}
        editor={editor}
        agentName={agentName}
        actions={{ send: async () => undefined, remember: async () => undefined, removeCompetitor: async () => undefined, addCompetitor: async () => undefined, setPlatforms: async () => undefined, start: async () => undefined }}
        composer={<StartChat defaultAgent={agentSlug} placeholder={initialText || "What do you want to find out?"} />}
      />
    );
  }

  const intake = current.intake;
  const files: ComposerFile[] = [
    ...(fileRows ?? []).map((row) => ({ key: row.id, name: row.name, kind: row.kind, status: row.status })),
    ...uploading,
  ];
  const locked = intake.status === "started";

  const composer = (
    <div className="grid gap-1">
      <ChatComposer
        placeholder={intake.status === "ready" ? "Ask to change anything in the plan…" : "Answer, or tap a choice…"}
        disabled={intake.status === "thinking"}
        agent={{ value: agentSlug, options: [{ slug: agentSlug, name: agentName, live: true }], locked: true }}
        mode={{ value: intake.mode ?? "thorough", onChange: (mode) => void setMode({ workspaceId, intakeId, mode }), locked }}
        sources={{
          value: intake.slots.origins.platforms === "you" ? intake.slots.platforms : null,
          onChange: (value) => void editPlan({ workspaceId, intakeId, ...(value ? { platforms: value } : { everywhere: true }) }),
        }}
        links={{
          value: intake.slots.links,
          onAdd: (url) => void editPlan({ workspaceId, intakeId, addLink: url }),
          onRemove: (url) => void editPlan({ workspaceId, intakeId, removeLink: url }),
        }}
        files={{
          value: files,
          onAdd: (picked) => {
            for (const file of picked) {
              const kind: ComposerFile["kind"] | null = file.type.startsWith("image/") ? "image" : file.type === "application/pdf" ? "pdf" : /csv/.test(file.type) || /\.csv$/i.test(file.name) ? "csv" : null;
              if (!kind || file.size > 10 * 1024 * 1024) {
                setProblem("Add images, PDFs or CSV spreadsheets up to 10 MB.");
                continue;
              }
              const key = `up-${file.name}-${Date.now()}`;
              setUploading((rows) => [...rows, { key, name: file.name, kind, status: "uploading" }]);
              void (async () => {
                try {
                  const url = await uploadUrl({ workspaceId });
                  const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "text/csv" }, body: file });
                  const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
                  await attach({ workspaceId, storageId, name: file.name, intakeId });
                } catch (error) {
                  setProblem(error instanceof Error ? error.message.replace(/^[\s\S]*Uncaught Error: /, "").split("\n")[0] : "That file was not added.");
                } finally {
                  setUploading((rows) => rows.filter((row) => row.key !== key));
                }
              })();
            }
          },
          onRemove: (key) => void removeFile({ workspaceId, fileId: key as Id<"sessionFiles"> }).catch(() => undefined),
        }}
        connect={{
          canConnect: shell?.role === "owner",
          metaConnected: Boolean(meta?.connection),
          onConnectMeta: () =>
            void startConnect({ workspaceId, returnOrigin: window.location.origin, returnPath: `${base}/sessions/new?intake=${intakeId}` }).then(({ url }) => window.location.assign(url)),
        }}
        footnote={`Question ${Math.min(intake.questionsAsked, intake.maxQuestions)} of up to ${intake.maxQuestions} · this conversation ${money(intake.costCents)} of ${money(intake.capCents)}`}
        onSubmit={async (text) => {
          setProblem("");
          await reply({ workspaceId, intakeId, text });
        }}
      />
      {problem ? <p className="px-1 text-xs text-destructive">{problem}</p> : null}
    </div>
  );

  return (
    <IntakeChatView
      view={current}
      editor={editor}
      agentName={agentName}
      composer={composer}
      actions={{
        send: async (text) => {
          await reply({ workspaceId, intakeId, text });
        },
        remember: async (factKey, yes) => {
          await remember({ workspaceId, intakeId, factKey, yes });
        },
        removeCompetitor: async (name) => {
          await editPlan({ workspaceId, intakeId, removeCompetitor: name });
        },
        addCompetitor: async (name) => {
          await editPlan({ workspaceId, intakeId, addCompetitor: name });
        },
        setPlatforms: async (platforms) => {
          await editPlan({ workspaceId, intakeId, platforms });
        },
        start: async () => {
          const slots = intake.slots;
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
          await startRun({ workspaceId, agentSlug, skillSlug: "market-intelligence", projectId, mode: intake.mode ?? "thorough" });
          await markStarted({ workspaceId, intakeId, projectId });
          router.push(`${base}/sessions/${projectId}`);
        },
      }}
    />
  );
}
