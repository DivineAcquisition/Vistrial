"use client";

import { useAction, useMutation, useQuery } from "convex/react";

import { IntegrationsView } from "@/components/connections/integrations-view";
import { TranscriptsView } from "@/components/connections/transcripts-view";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { describeError } from "@/lib/errors/user-error";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** The connections that can be read again on request, and the one line their cards carry while connected. */
export const CALENDARS = ["google_calendar", "calendly"];
const SOON = "Booked-call numbers will appear in Sales conversion.";
export const CALENDAR_NOTES: Record<string, string> = { google_calendar: SOON, calendly: SOON };

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

  return (
    <IntegrationsView
      providers={data.providers}
      canManage={data.canManage}
      canRefresh={data.canRefresh}
      refreshable={CALENDARS}
      notes={CALENDAR_NOTES}
      returned={returned}
      actions={{
        connect: (provider) =>
          attempt(async () => {
            const { url } = await startConnect({ workspaceId, provider, returnOrigin: window.location.origin });
            window.location.assign(url);
          }),
        disconnect: (provider) => attempt(() => disconnect({ workspaceId, provider })),
        refresh: (provider) => attempt(() => syncNow({ workspaceId, provider })),
      }}
      extra={{
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
