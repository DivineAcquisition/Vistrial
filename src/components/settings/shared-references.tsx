"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BookCopy, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { errorWords } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type ReferenceItem = { id: string; title: string; kind: string; fromName: string; copiedAt: number; copiedByName: string; chars: number; cut: boolean };
export type ReferenceSource = { workspaceId: string; name: string; archived: boolean; items: { assetId: string; title: string; kind: string; createdAt: number; copied: boolean }[] };
export type ReferencesData = { items: ReferenceItem[]; canCopy: boolean; canRemove: boolean; limit: number };

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * Material copied in from the Owner's other organizations, for this organization's agents to read as
 * reference. A copy is a snapshot: read-only here, labelled with where it came from, removable.
 */
export function SharedReferencesView({
  name,
  data,
  sources,
  body,
  problem,
  busy,
  onOpenSources,
  onCopy,
  onRemove,
  onRead,
}: {
  name: string;
  data: ReferencesData;
  /** Null until the Owner opens the picker; then their other organizations and what each offers. */
  sources: ReferenceSource[] | null;
  /** The piece being read, when one is open. */
  body: { id: string; text: string } | null;
  problem: string | null;
  busy: string | null;
  onOpenSources: () => void;
  onCopy: (fromWorkspaceId: string, assetId: string) => void;
  onRemove: (id: string) => void;
  onRead: (id: string | null) => void;
}) {
  if (!data.canCopy && data.items.length === 0) return null;
  const full = data.items.length >= data.limit;
  return (
    <Panel className="grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-2xl gap-1">
          <h3 className="flex items-center gap-2 font-heading text-base text-card-foreground">
            <BookCopy aria-hidden className="size-4 text-primary" /> Reference from your other organizations
          </h3>
          <p className="text-sm text-muted-foreground">
            Approved reports and offer analyses copied in for {name}&apos;s agents to read. Agents are told each one comes from a different business, so it is used as reference and never as a fact
            about this one. A copy does not change when the original does. Work made for a client, connections, people and brand kits are never copied.
          </p>
        </div>
        {data.canCopy ? (
          <Button variant="outline" disabled={full} onClick={onOpenSources}>
            Copy something in
          </Button>
        ) : null}
      </div>

      {data.items.length ? (
        <ul className="grid divide-y divide-border/70 rounded-xl border border-border">
          {data.items.map((item) => (
            <li key={item.id} className="grid gap-2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-medium text-card-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {item.kind} · from {item.fromName} · copied {day(item.copiedAt)} by {item.copiedByName}
                    {item.cut ? " · shortened to fit" : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge label="Read-only" tone="neutral" className="[&_span]:normal-case" />
                  <Button size="sm" variant="outline" onClick={() => onRead(body?.id === item.id ? null : item.id)}>
                    {body?.id === item.id ? "Close" : "Read"}
                  </Button>
                  {data.canRemove ? (
                    <Button size="sm" variant="outline" aria-label={`Remove ${item.title}`} disabled={busy !== null} onClick={() => onRemove(item.id)}>
                      <Trash2 aria-hidden /> {busy === `remove:${item.id}` ? "Removing…" : "Remove"}
                    </Button>
                  ) : null}
                </span>
              </div>
              {body?.id === item.id ? (
                <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-background p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-card-foreground">{body.text}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing has been copied in yet.</p>
      )}
      {full ? <p className="text-sm text-muted-foreground">This organization holds {data.limit} copied documents, the most it can. Remove one to copy another.</p> : null}

      {sources ? (
        <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
          <p className="text-sm text-card-foreground">Choose what to copy into {name}.</p>
          {sources.length === 0 ? <p className="text-sm text-muted-foreground">You have no other organization to copy from.</p> : null}
          {sources.map((source) => (
            <div key={source.workspaceId} className="grid gap-1.5">
              <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {source.name}
                {source.archived ? " · archived" : ""}
              </p>
              {source.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approved report or offer analysis of its own yet.</p>
              ) : (
                <ul className="grid gap-1.5">
                  {source.items.map((item) => (
                    <li key={item.assetId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                      <span className="grid min-w-0">
                        <span className="truncate text-sm text-card-foreground">{item.title}</span>
                        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                          {item.kind} · {day(item.createdAt)}
                        </span>
                      </span>
                      {item.copied ? (
                        <StatusBadge label="Copied" tone="good" className="[&_span]:normal-case" />
                      ) : (
                        <Button size="sm" disabled={busy !== null || full} onClick={() => onCopy(source.workspaceId, item.assetId)}>
                          {busy === `copy:${item.assetId}` ? "Copying…" : "Copy in"}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </Panel>
  );
}

/** Wired to the open organization. */
export function SharedReferences({ workspaceId, name }: { workspaceId: Id<"workspaces">; name: string }) {
  const data = useQuery(api.sharedReferences.list, { workspaceId });
  const [picking, setPicking] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const sources = useQuery(api.sharedReferences.sources, picking && data?.canCopy ? { workspaceId } : "skip");
  const open = useQuery(api.sharedReferences.get, reading && data?.items.some((row) => row.id === reading) ? { workspaceId, referenceId: reading as Id<"sharedReferences"> } : "skip");
  const copy = useMutation(api.sharedReferences.copy);
  const remove = useMutation(api.sharedReferences.remove);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (!data) return null;
  const run = async (key: string, work: () => Promise<unknown>, fallback: string) => {
    setBusy(key);
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
    <SharedReferencesView
      name={name}
      data={data}
      sources={picking ? (sources ?? []) : null}
      body={reading && open ? { id: reading, text: open.body } : null}
      problem={problem}
      busy={busy}
      onOpenSources={() => setPicking((value) => !value)}
      onCopy={(fromWorkspaceId, assetId) =>
        void run(`copy:${assetId}`, () => copy({ workspaceId, fromWorkspaceId: fromWorkspaceId as Id<"workspaces">, assetId: assetId as Id<"assets"> }), "That could not be copied. Try again.")
      }
      onRemove={(id) => void run(`remove:${id}`, () => remove({ workspaceId, referenceId: id as Id<"sharedReferences"> }), "That could not be removed. Try again.")}
      onRead={setReading}
    />
  );
}
