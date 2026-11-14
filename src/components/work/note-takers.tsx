"use client";

import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { Mic, NotebookPenIcon } from "@/components/icons";
import { useClientScope } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { SectionTitle } from "./work-shell";

export type NoteTakersData = FunctionReturnType<typeof api.noteTakers.status>;
export type FirefliesCall = FunctionReturnType<typeof api.noteTakers.firefliesCalls>[number];

export type NoteTakersActions = {
  connect: (apiKey: string) => Promise<unknown>;
  listFireflies: () => Promise<FirefliesCall[]>;
  importFireflies: (callId: string) => Promise<unknown>;
  transcribe: (messageRef: string) => Promise<unknown>;
};

function when(at: number | null) {
  return at ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

/** Note takers and recordings with the data handed in, so a story can show it without a server. */
export function NoteTakersView({ data, actions, initialCalls = null }: { data: NoteTakersData; actions: NoteTakersActions; initialCalls?: FirefliesCall[] | null }) {
  const [key, setKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [calls, setCalls] = useState<FirefliesCall[] | null>(initialCalls);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const act = async (id: string, action: () => Promise<unknown>, after?: string) => {
    setBusy(id);
    try {
      await action();
      if (after) setDone(after);
    } catch (error) {
      showError(error);
    }
    setBusy(null);
  };
  const consentBox = (
    <CheckboxField
      label="These calls were recorded lawfully"
      description="Everyone on the call agreed to the recording where the law asks for that. Only the words are kept, shared with Dealmaker."
      checked={consent}
      onCheckedChange={(next) => setConsent(next === true)}
    />
  );

  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6" data-note-takers>
      <SectionTitle icon={NotebookPenIcon}>Note takers and recordings</SectionTitle>
      <p className="text-sm text-muted-foreground">Bring in the words of a call you choose: from Fireflies, or from a call recorded in your CRM. Dealmaker never joins or records a call.</p>
      {data.canImport ? consentBox : null}
      {done ? (
        <p className="text-xs text-foreground" role="status">
          {done}
        </p>
      ) : null}

      <div className="grid gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Fireflies</h3>
        {data.fireflies?.connected ? (
          <>
            <p className="text-sm text-foreground">Connected as {data.fireflies.accountLabel}.</p>
            {calls === null ? (
              <div>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act("list", async () => setCalls(await actions.listFireflies()))}>
                  Show recent calls
                </Button>
              </div>
            ) : calls.length ? (
              <ul className="grid gap-1.5">
                {calls.map((call) => (
                  <li key={call.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-foreground">
                      {call.title}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · {when(call.at)}
                        {call.minutes ? ` · ${call.minutes} min` : ""}
                      </span>
                    </span>
                    {call.imported ? (
                      <span className="text-xs text-muted-foreground">In your transcripts</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!consent || busy !== null || !data.canImport}
                        onClick={() =>
                          void act(
                            call.id,
                            async () => {
                              await actions.importFireflies(call.id);
                              setCalls((rows) => rows?.map((row) => (row.id === call.id ? { ...row, imported: true } : row)) ?? null);
                            },
                            `"${call.title}" is in your transcripts, shared with Dealmaker.`,
                          )
                        }
                      >
                        Bring in
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Fireflies has no recent calls.</p>
            )}
          </>
        ) : data.canConnect ? (
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">
              Paste your Fireflies API key (Fireflies: Integrations, Fireflies API). Fireflies offers no read-only key, so this key could change things in Fireflies; Vistrial only reads with it, keeps
              it on the server and never shows it again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input aria-label="Fireflies API key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} className="min-w-0 flex-1 basis-56" />
              <Button
                size="sm"
                disabled={!key.trim() || busy !== null}
                onClick={() =>
                  void act("connect", async () => {
                    await actions.connect(key);
                    setKey("");
                  })
                }
              >
                Connect Fireflies
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not connected. An Owner or Admin connects Fireflies here.</p>
        )}
        <p className="text-xs text-muted-foreground">{data.fathom}</p>
      </div>

      <div className="grid gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Calls recorded in your CRM</h3>
        {!data.transcribing ? (
          <p className="text-sm text-muted-foreground">Transcribing recordings is not set up yet.</p>
        ) : data.recordings.length ? (
          <ul className="grid gap-1.5">
            {data.recordings.map((call) => (
              <li key={call.ref} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="text-foreground">
                  {call.leadName}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {when(call.at)} · {call.minutes} min
                  </span>
                </span>
                {call.imported ? (
                  <span className="text-xs text-muted-foreground">In your transcripts</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!consent || busy !== null || !data.canImport}
                    onClick={() =>
                      void act(call.ref, () => actions.transcribe(call.ref), `The call with ${call.leadName} is in your transcripts, shared with Dealmaker. The recording itself was not kept.`)
                    }
                  >
                    <Mic aria-hidden className="size-3.5" />
                    Transcribe
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No recorded calls of half a minute or more in the last two weeks.</p>
        )}
      </div>
    </Panel>
  );
}

/** Note takers and recordings for the organization or the client the picker names. */
export function NoteTakers({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const { clientId } = useClientScope();
  const data = useQuery(api.noteTakers.status, { workspaceId, clientId });
  const connect = useAction(api.noteTakers.connectFireflies);
  const list = useAction(api.noteTakers.firefliesCalls);
  const importCall = useAction(api.noteTakers.importFireflies);
  const transcribe = useAction(api.noteTakers.transcribeRecording);
  if (!data) return null;
  const actions: NoteTakersActions = {
    connect: (apiKey) => connect({ workspaceId, apiKey }),
    listFireflies: () => list({ workspaceId }),
    importFireflies: (callId) => importCall({ workspaceId, firefliesId: callId, consentConfirmed: true, clientId }),
    transcribe: (messageRef) => transcribe({ workspaceId, messageRef, consentConfirmed: true, clientId }),
  };
  return <NoteTakersView data={data} actions={actions} />;
}
