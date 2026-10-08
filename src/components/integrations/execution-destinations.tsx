"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  chooseChannel,
  chooseDriveFolder,
  createDriveFolder,
  disconnectDestination,
  getDrivePickerConfig,
  listDestinationChoices,
  sendTest,
  type Choice,
} from "@/app/(workspace)/app/settings/integrations/destination-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import {
  EXECUTION_KINDS,
  EXECUTION_SCOPE_LINES,
  EXECUTION_TITLES,
  EXECUTION_UNLOCKS,
  type ExecutionKind,
} from "@/lib/execution/kinds";
import { describeConnection } from "@/lib/execution/state";
import type { ExecutionConnectionView } from "@/lib/execution/types";
import { errorClass } from "@/lib/ui";

type Result = { ok: boolean; error?: string };

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = useCallback(
    (work: () => Promise<Result>, success?: string) =>
      startTransition(async () => {
        const result = await work();
        if (result.ok) {
          if (success) toastManager.add({ title: success, type: "success" });
          router.refresh();
        } else {
          toastManager.add({ title: "Not done", description: result.error, type: "error" });
        }
      }),
    [router]
  );
  return { pending, run };
}

function ChannelPicker({ kind, onChosen }: { kind: "slack" | "discord"; onChosen: () => void }) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState("");
  const { pending, run } = useAction();

  const load = useCallback(async () => {
    setChoices(null);
    setError(null);
    const result = await listDestinationChoices(kind);
    if (result.ok) setChoices(result.choices);
    else setError(result.error);
  }, [kind]);

  useEffect(() => {
    // Pulled live from their workspace each time this opens; never typed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className={errorClass}>{error}</p>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!choices) return <p className="text-sm text-muted-foreground">Loading your channels…</p>;
  if (!choices.length) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {kind === "slack"
            ? "No public channels were found. Create one in Slack, then refresh."
            : "No text channels were found. Create one in Discord, then refresh."}
        </p>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Refresh list
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <Select
          aria-label={`${EXECUTION_TITLES[kind]} channel`}
          value={picked}
          placeholder="Choose a channel"
          options={[{ value: "", label: "Choose a channel" }, ...choices.map((c) => ({ value: c.id, label: c.label }))]}
          onChange={(event) => setPicked(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!picked}
          loading={pending}
          loadingLabel="Saving"
          onClick={() => run(() => chooseChannel(kind, picked).then((r) => (r.ok ? (onChosen(), r) : r)), "Saved")}
        >
          Use this channel
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Refresh list
        </Button>
      </div>
    </div>
  );
}

type PickerDoc = { id: string };
type PickerResponse = { action: string; docs?: PickerDoc[] };
type GooglePickerApi = {
  ViewId: { FOLDERS: string };
  Action: { PICKED: string };
  DocsView: new (viewId: string) => {
    setIncludeFolders(on: boolean): unknown;
    setSelectFolderEnabled(on: boolean): unknown;
    setMimeTypes(types: string): unknown;
  };
  PickerBuilder: new () => {
    addView(view: unknown): unknown;
    setOAuthToken(token: string): unknown;
    setDeveloperKey(key: string): unknown;
    setAppId(id: string): unknown;
    setTitle(title: string): unknown;
    setCallback(fn: (response: PickerResponse) => void): unknown;
    build(): { setVisible(visible: boolean): void };
  };
};
type WindowWithGoogle = Window & {
  gapi?: { load: (name: string, callback: () => void) => void };
  google?: { picker?: GooglePickerApi };
};

function loadGoogleScript(): Promise<void> {
  const w = window as WindowWithGoogle;
  if (w.gapi) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(script);
  });
}

function DriveFolderChooser() {
  const { pending, run } = useAction();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPicker = async () => {
    setError(null);
    setOpening(true);
    try {
      const config = await getDrivePickerConfig();
      if (!config.ok) {
        setError(config.error);
        return;
      }
      await loadGoogleScript();
      const w = window as WindowWithGoogle;
      await new Promise<void>((resolve) => w.gapi?.load("picker", resolve));
      const api = w.google?.picker;
      if (!api) throw new Error("picker missing");
      const view = new api.DocsView(api.ViewId.FOLDERS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(true);
      view.setMimeTypes("application/vnd.google-apps.folder");
      const builder = new api.PickerBuilder();
      builder.addView(view);
      builder.setOAuthToken(config.accessToken);
      builder.setDeveloperKey(config.apiKey);
      builder.setAppId(config.appId);
      builder.setTitle("Choose the folder Vistrial files into");
      builder.setCallback((response) => {
        if (response.action === api.Action.PICKED && response.docs?.[0]) {
          const folderId = response.docs[0].id;
          run(() => chooseDriveFolder(folderId), "Folder saved");
        }
      });
      builder.build().setVisible(true);
    } catch {
      setError("Google's folder window could not open. Allow pop-ups and scripts from Google, then try again.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={opening} loadingLabel="Opening" onClick={() => void openPicker()}>
          Choose a folder
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          loadingLabel="Creating"
          onClick={() => run(() => createDriveFolder(), "Folder created")}
        >
          Create a Vistrial folder
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Vistrial can only see the folder you choose and what it files inside it.
      </p>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

function DestinationCard({
  view,
  configured,
  canManage,
}: {
  view: ExecutionConnectionView;
  configured: boolean;
  canManage: boolean;
}) {
  const kind: ExecutionKind = view.kind;
  const state = describeConnection(view, configured);
  const { pending, run } = useAction();
  const [changing, setChanging] = useState(false);
  const startHref = `/api/execution/oauth/start?kind=${kind}`;

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-sm text-card-foreground">{EXECUTION_TITLES[kind]}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{EXECUTION_UNLOCKS[kind]}</p>
        </div>
        <Badge variant={state.tone === "good" ? "success" : state.tone === "warning" ? "warning" : "outline"} size="sm">
          {state.step === "ready" ? "Connected" : state.step === "reconnect" ? "Needs attention" : state.step === "choose" ? "Almost done" : "Not connected"}
        </Badge>
      </div>

      {state.step !== "connect" && state.step !== "unavailable" ? (
        <div>
          <p className="text-sm font-medium text-card-foreground">{state.title}</p>
          {state.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{state.detail}</p> : null}
        </div>
      ) : state.step === "unavailable" ? (
        <p className="text-xs text-muted-foreground">{state.detail}</p>
      ) : null}

      {canManage && state.step === "choose" ? (
        kind === "google_drive" ? (
          <DriveFolderChooser />
        ) : (
          <ChannelPicker kind={kind} onChosen={() => setChanging(false)} />
        )
      ) : null}

      {canManage && state.step === "ready" && changing ? (
        kind === "google_drive" ? (
          <DriveFolderChooser />
        ) : (
          <ChannelPicker kind={kind} onChosen={() => setChanging(false)} />
        )
      ) : null}

      <p className="text-xs text-muted-foreground">{EXECUTION_SCOPE_LINES[kind]}</p>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          {state.step === "connect" ? (
            <Button variant="primary" size="sm" render={<a href={startHref} />}>
              Connect {EXECUTION_TITLES[kind]}
            </Button>
          ) : null}
          {state.step === "reconnect" ? (
            <Button variant="primary" size="sm" render={<a href={startHref} />}>
              Reconnect
            </Button>
          ) : null}
          {state.step === "ready" ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={pending}
                loadingLabel="Sending"
                onClick={() => run(() => sendTest(kind), "Test sent")}
              >
                {kind === "google_drive" ? "File a test" : "Send a test"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setChanging((open) => !open)}>
                {kind === "google_drive" ? "Change folder" : "Change channel"}
              </Button>
            </>
          ) : null}
          {state.step !== "connect" && state.step !== "unavailable" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => disconnectDestination(kind), `${EXECUTION_TITLES[kind]} disconnected`)}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function ExecutionDestinations({
  views,
  configured,
  canManage,
  flash,
  flashError,
}: {
  views: ExecutionConnectionView[];
  configured: Record<ExecutionKind, boolean>;
  canManage: boolean;
  flash: string | null;
  flashError: string | null;
}) {
  return (
    <section aria-labelledby="where-vistrial-posts" className="space-y-3">
      <div>
        <h2 id="where-vistrial-posts" className="font-heading text-base text-card-foreground">
          Where Vistrial posts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your team sees these. Nothing here ever reaches a lead. Disconnecting stops new posts and leaves everything
          already posted or filed exactly where it is.
        </p>
      </div>
      {flash ? <p className="text-sm font-medium text-success">{flash}</p> : null}
      {flashError ? <p className={errorClass}>{flashError}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {EXECUTION_KINDS.map((kind) => {
          const view = views.find((candidate) => candidate.kind === kind);
          return view ? (
            <DestinationCard key={kind} view={view} configured={configured[kind]} canManage={canManage} />
          ) : null;
        })}
      </div>
    </section>
  );
}
