"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Archive, Download, RotateCcw } from "lucide-react";

import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { errorWords } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type ArchiveState = {
  archived: boolean;
  archivedAt: number | null;
  isOwner: boolean;
  canArchive: boolean;
  cannotArchiveReason: string | null;
  feeWords: string;
  canRestore: boolean;
  cannotRestoreReason: string | null;
};

export type ExportRow = { id: string; status: "building" | "ready" | "failed" | "expired"; createdAt: number; expiresAt: number | null; bytes: number | null; records: number | null; url: string | null };

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const size = (bytes: number) => (bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`);

const EXPORT_STATUS: Record<ExportRow["status"], { label: string; tone: "good" | "warning" | "critical" | "neutral" }> = {
  building: { label: "Being built", tone: "warning" },
  ready: { label: "Ready", tone: "good" },
  failed: { label: "Did not finish", tone: "critical" },
  expired: { label: "Removed after a week", tone: "neutral" },
};

/** Export and archive for one organization. Owners only; everyone else sees nothing here. */
export function OrganizationDataView({
  name,
  state,
  exports,
  problem,
  busy,
  onExport,
  onArchive,
  onRestore,
}: {
  name: string;
  state: ArchiveState;
  exports: ExportRow[];
  problem: string | null;
  busy: "export" | "archive" | "restore" | null;
  onExport: () => void;
  onArchive: (typed: string) => void;
  onRestore: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  if (!state.isOwner) return null;
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <div className="grid gap-4">
      <Panel className="grid gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid max-w-2xl gap-1">
            <h3 className="flex items-center gap-2 font-heading text-base text-card-foreground">
              <Download aria-hidden className="size-4 text-primary" /> Export this organization&apos;s data
            </h3>
            <p className="text-sm text-muted-foreground">
              One .zip of {name}&apos;s work in open formats: reports as Markdown, call transcripts as text, and clients, offers, decisions, results, brand kits, creative and page teardowns as JSON. It
              leaves out connected accounts and their tokens, people, billing, and uploaded images. Built in the background and kept for a week.
            </p>
          </div>
          <Button variant="outline" disabled={busy !== null || exports.some((row) => row.status === "building")} onClick={onExport}>
            {busy === "export" ? "Starting…" : "Start an export"}
          </Button>
        </div>
        {exports.length ? (
          <ul className="grid divide-y divide-border/70 rounded-xl border border-border">
            {exports.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-card-foreground" suppressHydrationWarning>
                    {day(row.createdAt)}
                  </span>
                  <StatusBadge label={EXPORT_STATUS[row.status].label} tone={EXPORT_STATUS[row.status].tone} className="[&_span]:normal-case" />
                </span>
                <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {row.records !== null && row.bytes !== null ? (
                    <span>
                      {row.records.toLocaleString("en-US")} records · {size(row.bytes)}
                    </span>
                  ) : null}
                  {row.url && row.expiresAt ? (
                    <a href={row.url} download className="font-medium text-primary underline-offset-2 hover:underline" suppressHydrationWarning>
                      Download (until {day(row.expiresAt)})
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel className="grid gap-3 p-5">
        <div className="grid max-w-2xl gap-1">
          <h3 className="flex items-center gap-2 font-heading text-base text-card-foreground">
            <Archive aria-hidden className="size-4 text-primary" /> {state.archived ? "This organization is archived" : "Archive this organization"}
          </h3>
          {state.archived ? (
            <p className="text-sm text-muted-foreground">
              {state.archivedAt ? `Archived on ${day(state.archivedAt)}. ` : ""}Everything in it can still be read and exported. Nothing can be changed, and agents do no work in it, until it is
              brought back.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              It becomes read-only and leaves the organization menu&apos;s main list. Work that is running stops. Nothing is deleted, and an Owner can bring it back. {state.feeWords}
            </p>
          )}
        </div>
        {state.archived ? (
          state.canRestore ? (
            <Button className="w-fit" disabled={busy !== null} onClick={onRestore}>
              <RotateCcw aria-hidden /> {busy === "restore" ? "Bringing it back…" : "Bring it back"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{state.cannotRestoreReason}</p>
          )
        ) : !state.canArchive ? (
          <p className="text-sm text-muted-foreground">{state.cannotArchiveReason}</p>
        ) : confirming ? (
          <form
            className="grid max-w-md gap-2 rounded-xl border border-destructive/30 bg-destructive/[0.04] p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (matches) onArchive(typed);
            }}
          >
            <label className="grid gap-1.5 text-sm">
              <span className="text-card-foreground">
                Type <span className="font-semibold">{name}</span> to archive it
              </span>
              <Input autoFocus value={typed} onChange={(event) => setTyped(event.target.value)} aria-label="The organization's name" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" disabled={!matches || busy !== null}>
                {busy === "archive" ? "Archiving…" : "Archive it"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" className="w-fit" onClick={() => setConfirming(true)}>
            Archive {name}
          </Button>
        )}
      </Panel>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** Wired to the open organization. */
export function OrganizationData({ workspaceId, name }: { workspaceId: Id<"workspaces">; name: string }) {
  const state = useQuery(api.organizations.archiveState, { workspaceId });
  const exports = useQuery(api.exports.list, state?.isOwner ? { workspaceId } : "skip");
  const start = useMutation(api.exports.start);
  const archive = useMutation(api.organizations.archive);
  const restore = useMutation(api.organizations.restore);
  const [busy, setBusy] = useState<"export" | "archive" | "restore" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (!state?.isOwner) return null;
  const run = async (kind: "export" | "archive" | "restore", work: () => Promise<unknown>, fallback: string) => {
    setBusy(kind);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(errorWords(error, fallback));
    } finally {
      setBusy(null);
    }
  };
  return (
    <OrganizationDataView
      name={name}
      state={state}
      exports={exports ?? []}
      problem={problem}
      busy={busy}
      onExport={() => void run("export", () => start({ workspaceId }), "The export could not be started. Try again.")}
      onArchive={(typed) => void run("archive", () => archive({ workspaceId, confirmName: typed }), "The organization could not be archived. Try again.")}
      onRestore={() => void run("restore", () => restore({ workspaceId }), "The organization could not be brought back. Try again.")}
    />
  );
}

/** Shown on every page of an archived organization. */
export function ArchivedNotice({ workspaceId, name }: { workspaceId: Id<"workspaces">; name: string }) {
  const state = useQuery(api.organizations.archiveState, { workspaceId });
  if (!state?.archived) return null;
  return <ArchivedBanner name={name} owner={state.isOwner} />;
}

export function ArchivedBanner({ name, owner }: { name: string; owner: boolean }) {
  return (
    <div className="mb-4">
      <Banner tone="warning" title={`${name} is archived`}>
        You can read and export everything in it. Nothing can be changed and agents do no work here. {owner ? "Bring it back from Settings, Business." : "An Owner can bring it back."}
      </Banner>
    </div>
  );
}
