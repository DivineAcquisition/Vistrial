"use client";

import { useAction, useMutation, useQuery } from "convex/react";

import { BookingsPanel, CALENDAR_PANELS } from "@/components/connections/bookings-panel";
import { IntegrationsView } from "@/components/connections/integrations-view";
import { TranscriptsView } from "@/components/connections/transcripts-view";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { describeError } from "@/lib/errors/user-error";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** The other connections, fed by Convex. Tokens never reach the browser. */
export function Integrations({
  workspaceId,
  returned,
  highlightTranscript,
}: {
  workspaceId: Id<"workspaces">;
  returned: { provider: string | null; outcome: string } | null;
  highlightTranscript?: string | null;
}) {
  const shell = useWorkspaceShell();
  const data = useQuery(api.integrations.list, { workspaceId });
  const bookings = useQuery(api.bookings.view, { workspaceId });
  const transcripts = useQuery(api.transcripts.list, { workspaceId });
  const startConnect = useMutation(api.integrations.startConnect);
  const disconnect = useAction(api.integrationActions.disconnect);
  const syncNow = useAction(api.bookings.syncNow);
  const addTranscript = useMutation(api.transcripts.add);
  const removeTranscript = useMutation(api.transcripts.remove);
  const grantTranscript = useMutation(api.transcripts.setAgentAccess);

  if (data === undefined) return <p className="text-sm text-muted-foreground">Loading connections.</p>;
  const attempt = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (problem) {
      showError(problem);
    }
  };
  const agents = (shell?.agents ?? []).filter((agent) => agent.status === "live").map((agent) => ({ slug: agent.slug, name: agent.name }));

  const card: Record<string, React.ReactNode> = {};
  for (const provider of data.providers) {
    const panel = CALENDAR_PANELS[provider.key];
    if (!panel || !provider.connection) continue;
    card[provider.key] = (
      <BookingsPanel
        bookings={bookings?.calendars.find((row) => row.provider === provider.key) ?? null}
        third={panel.third}
        caveat={panel.caveat}
        canRefresh={Boolean(bookings?.canRefresh) && provider.connection.status === "connected"}
        lastCode={provider.connection.lastSyncCode}
        onRefresh={() => attempt(() => syncNow({ workspaceId, provider: provider.key }))}
      />
    );
  }

  return (
    <IntegrationsView
      providers={data.providers}
      canManage={data.canManage}
      returned={returned}
      actions={{
        connect: (provider) =>
          attempt(async () => {
            const { url } = await startConnect({ workspaceId, provider, returnOrigin: window.location.origin });
            window.location.assign(url);
          }),
        disconnect: (provider) => attempt(() => disconnect({ workspaceId, provider })),
      }}
      extra={{
        card,
        group: {
          notes: transcripts ? (
            <TranscriptsView
              transcripts={transcripts.transcripts}
              agents={agents}
              canEdit={transcripts.canEdit}
              canGrant={transcripts.canGrant}
              highlight={highlightTranscript}
              onAdd={async (input) => {
                try {
                  await addTranscript({ workspaceId, ...input });
                  return null;
                } catch (problem) {
                  // Shown beside the form, where the person is looking.
                  return describeError(problem, "The transcript could not be added. Try again in a moment.").message;
                }
              }}
              onRemove={(id) => attempt(() => removeTranscript({ workspaceId, transcriptId: id as Id<"callTranscripts"> }))}
              onGrant={(id, agentSlug, granted) => void attempt(() => grantTranscript({ workspaceId, transcriptId: id as Id<"callTranscripts">, agentSlug, granted }))}
            />
          ) : null,
        },
      }}
    />
  );
}
