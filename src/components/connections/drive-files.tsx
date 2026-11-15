"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type DriveFilesData = NonNullable<FunctionReturnType<typeof api.googleDrive.list>>;
type DriveFile = DriveFilesData["files"][number];

export const DRIVE_PICKER_TEXT = {
  notSetUp: "Picking files is not set up on Vistrial yet. There is nothing for you to do.",
  intro: "Vistrial reads only the files you pick here: Google Docs, Sheets, Slides and plain text. Nothing else in your Drive.",
} as const;

const AGENTS = [
  { slug: "growth-architect", name: "Strategist" },
  { slug: "sales-conversion", name: "Dealmaker" },
];

/* ---------------------------------------------------------------------------
 * Google's Picker, opened with its own short token in this page only. Vistrial's stored token never comes
 * here, and this token is never sent to Vistrial: only the ids of the picked files are.
 * ------------------------------------------------------------------------- */

type PickerWindow = Window & {
  google?: {
    accounts?: { oauth2: { initTokenClient: (config: Record<string, unknown>) => { requestAccessToken: (options?: Record<string, unknown>) => void } } };
    picker?: Record<string, unknown> & {
      PickerBuilder: new () => Record<string, (...args: unknown[]) => unknown>;
      DocsView: new (viewId?: unknown) => { setMimeTypes: (types: string) => unknown; setIncludeFolders?: (value: boolean) => unknown };
      ViewId: Record<string, unknown>;
      Feature: Record<string, unknown>;
      Action: Record<string, string>;
    };
  };
  gapi?: { load: (name: string, done: () => void) => void };
};

const PICKABLE = ["application/vnd.google-apps.document", "application/vnd.google-apps.spreadsheet", "application/vnd.google-apps.presentation", "text/plain", "text/markdown", "text/csv"].join(",");

export function pickerSettings() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
  const appId = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER;
  return clientId && apiKey && appId ? { clientId, apiKey, appId } : null;
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google's file picker could not load."));
    document.head.appendChild(script);
  });
}

/** Opens Google's Picker and resolves with the ids picked, or an empty list when the person closes it. */
async function pickFiles(settings: { clientId: string; apiKey: string; appId: string }, hint: string | null): Promise<string[]> {
  const w = window as PickerWindow;
  await Promise.all([loadScript("https://accounts.google.com/gsi/client"), loadScript("https://apis.google.com/js/api.js")]);
  await new Promise<void>((resolve) => w.gapi!.load("picker", resolve));
  const token = await new Promise<string>((resolve, reject) => {
    const client = w.google!.accounts!.oauth2.initTokenClient({
      client_id: settings.clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      ...(hint ? { hint } : {}),
      callback: (answer: { access_token?: string; error?: string }) => (answer.access_token ? resolve(answer.access_token) : reject(new Error("Google did not open the file picker."))),
      error_callback: () => reject(new Error("Google did not open the file picker.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
  const picker = w.google!.picker!;
  return new Promise<string[]>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS);
    view.setMimeTypes(PICKABLE);
    view.setIncludeFolders?.(false);
    const builder = new picker.PickerBuilder();
    builder.addView(view);
    builder.setOAuthToken(token);
    builder.setDeveloperKey(settings.apiKey);
    builder.setAppId(settings.appId);
    builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
    builder.setMaxItems(10);
    builder.setCallback((data: { action?: string; docs?: { id?: string }[] }) => {
      if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).map((doc) => doc.id).filter((id): id is string => typeof id === "string"));
      else if (data.action === picker.Action.CANCEL) resolve([]);
    });
    (builder.build() as { setVisible: (on: boolean) => void }).setVisible(true);
  });
}

/* ---------------------------------------------------------------------------
 * The list of picked files
 * ------------------------------------------------------------------------- */

export type DriveFilesActions = {
  pick: () => Promise<void>;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  grant: (id: string, agentSlug: string, granted: boolean) => Promise<void>;
  asTranscript: (id: string) => Promise<void>;
  toPlaybook: (id: string) => Promise<void>;
};

function FileRow({ file, data, actions }: { file: DriveFile; data: DriveFilesData; actions: DriveFilesActions }) {
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="grid gap-1.5 rounded-lg border border-border bg-background/60 p-2.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium text-foreground">{file.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {file.kindWord} · {file.words.toLocaleString("en-US")} words
        </span>
      </div>
      {file.opening ? <p className="line-clamp-2 text-xs text-muted-foreground">{file.opening}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {AGENTS.map((agent) => {
          const on = file.agents.includes(agent.slug);
          return (
            <button
              key={agent.slug}
              type="button"
              disabled={!data.canPick || busy}
              aria-pressed={on}
              onClick={() => run(() => actions.grant(file.id, agent.slug, !on))}
              className={on ? "rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-foreground" : "rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"}
            >
              {agent.name} {on ? "reads it" : "does not"}
            </button>
          );
        })}
      </div>
      {data.canEdit ? (
        <div className="flex flex-wrap gap-1.5">
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" variant="ghost" disabled={busy}>
                Add as a call transcript
              </Button>
            }
            title="Add this file as a call transcript?"
            description="Only for the transcript of a real sales call. By adding it you confirm the call was recorded lawfully, with everyone's consent where the law requires it, and may be shared with Vistrial."
            confirmLabel="Add as a transcript"
            onConfirm={() => run(() => actions.asTranscript(file.id))}
          />
          {file.agents.includes("sales-conversion") ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run(() => actions.toPlaybook(file.id))}>
              Read into Playbook
            </Button>
          ) : null}
          {data.canPick ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run(() => actions.remove(file.id))}>
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** The Drive card's body: the Pick button and the picked files. */
export function DriveFilesPanel({ data, pickerReady, actions }: { data: DriveFilesData; pickerReady: boolean; actions: DriveFilesActions }) {
  const [busy, setBusy] = useState<"pick" | "refresh" | null>(null);
  const run = async (what: "pick" | "refresh", work: () => Promise<void>) => {
    setBusy(what);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm" data-drive-files>
      <p className="text-muted-foreground">{pickerReady ? DRIVE_PICKER_TEXT.intro : DRIVE_PICKER_TEXT.notSetUp}</p>
      {data.canPick && pickerReady ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => run("pick", actions.pick)}>
            {busy === "pick" ? "Opening Google Drive" : "Pick files"}
          </Button>
          {data.files.length ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("refresh", actions.refresh)}>
              {busy === "refresh" ? "Reading" : "Read again"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {data.files.length ? (
        <ul className="grid gap-2">
          {data.files.map((file) => (
            <FileRow key={file.id} file={file} data={data} actions={actions} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No files picked yet.</p>
      )}
    </div>
  );
}

/** Feeds the panel from Convex. */
export function DriveFilesCard({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const data = useQuery(api.googleDrive.list, { workspaceId });
  const addPicked = useAction(api.googleDrive.addPicked);
  const refresh = useAction(api.googleDrive.refresh);
  const remove = useMutation(api.googleDrive.remove);
  const grant = useMutation(api.googleDrive.setAgentAccess);
  const asTranscript = useMutation(api.googleDrive.useAsTranscript);
  const study = useMutation(api.playbook.study);
  const [notice, setNotice] = useState<string | null>(null);
  if (!data) return null;
  const settings = pickerSettings();
  const attempt = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      showError(error);
    }
  };
  const id = (value: string) => value as Id<"driveFiles">;
  return (
    <>
      <DriveFilesPanel
        data={data}
        pickerReady={settings !== null}
        actions={{
          pick: () =>
            attempt(async () => {
              const ids = await pickFiles(settings!, data.accountEmail);
              if (!ids.length) return;
              const result = await addPicked({ workspaceId, fileIds: ids });
              setNotice(
                [result.added.length ? `Added ${result.added.length} file${result.added.length === 1 ? "" : "s"}.` : "", ...result.refused.map((row) => row.why)].filter(Boolean).join(" ") || null,
              );
            }),
          refresh: () => attempt(() => refresh({ workspaceId })),
          remove: (fileId) => attempt(() => remove({ workspaceId, driveFileId: id(fileId) })),
          grant: (fileId, agentSlug, granted) => attempt(() => grant({ workspaceId, driveFileId: id(fileId), agentSlug, granted })),
          asTranscript: (fileId) =>
            attempt(async () => {
              await asTranscript({ workspaceId, driveFileId: id(fileId), consentConfirmed: true });
              setNotice("Added as a call transcript. It is listed under AI note takers.");
            }),
          toPlaybook: (fileId) =>
            attempt(async () => {
              await study({ workspaceId, driveFileIds: [id(fileId)] });
              setNotice("Dealmaker is reading it into the Playbook.");
            }),
        }}
      />
      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </>
  );
}
