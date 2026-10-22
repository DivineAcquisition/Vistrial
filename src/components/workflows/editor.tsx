"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";

import { confirmWorkflow, enrollExisting, pauseWorkflow, publishWorkflow, saveWorkflow } from "@/app/(workspace)/app/workflows/actions";
import { WorkflowOutline } from "@/components/workflows/outline";
import { Button } from "@/components/ui/button";
import { checkDocument, type CheckIssue } from "@/lib/workflows/checker";
import { diffGraphs, moveBox, previewLine, tidy } from "@/lib/workflows/graph";
import { QUIET_HOURS_NOTE, type Box, type PlaybookDocument } from "@/lib/workflows/types";

const WorkflowCanvas = dynamic(() => import("@/components/workflows/canvas").then((mod) => mod.WorkflowCanvas), { ssr: false });

export function WorkflowEditor({
  id,
  name,
  status,
  document,
  canEdit,
  canPublish,
  canPropose,
  canConfirm,
  canEnroll,
  liveCounts,
  versionNote,
  compare,
}: {
  id: string;
  name: string;
  status: string;
  document: PlaybookDocument;
  canEdit: boolean;
  canPublish: boolean;
  canPropose: boolean;
  canConfirm: boolean;
  canEnroll: boolean;
  liveCounts: Record<string, { now: number; stalled: boolean; shareLabel?: string }>;
  versionNote: string | null;
  compare: PlaybookDocument | null;
}) {
  const [doc, setDoc] = useState(document);
  const [past, setPast] = useState<PlaybookDocument[]>([]);
  const [future, setFuture] = useState<PlaybookDocument[]>([]);
  const [selected, setSelected] = useState<string | null>(doc.graph.boxes[0]?.id ?? null);
  const [view, setView] = useState<"picture" | "list">("list");
  const [mode, setMode] = useState<"design" | "live" | "compare">(status === "published" ? "live" : "design");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(versionNote);
  const [pending, start] = useTransition();
  const issues = useMemo(() => checkDocument(doc), [doc]);
  const box = doc.graph.boxes.find((item) => item.id === selected) ?? null;
  const changes = compare ? diffGraphs(compare.graph, doc.graph) : null;

  function commit(next: PlaybookDocument) {
    setPast((items) => [...items.slice(-29), doc]);
    setFuture([]);
    setDoc(next);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    start(async () => {
      const result = await action();
      setMessage(result.ok ? result.message ?? "Saved." : result.error ?? "Could not do that.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={view === "list" ? "primary" : "secondary"} onClick={() => setView("list")}>
          List
        </Button>
        <Button type="button" variant={view === "picture" ? "primary" : "secondary"} onClick={() => setView("picture")}>
          Picture
        </Button>
        <Button type="button" variant={mode === "design" ? "primary" : "secondary"} onClick={() => setMode("design")}>
          Design
        </Button>
        <Button type="button" variant={mode === "live" ? "primary" : "secondary"} onClick={() => setMode("live")}>
          Live
        </Button>
        {compare ? (
          <Button type="button" variant={mode === "compare" ? "primary" : "secondary"} onClick={() => setMode("compare")}>
            Compare
          </Button>
        ) : null}
        {canEdit ? (
          <Button type="button" variant="secondary" onClick={() => commit({ ...doc, graph: tidy(doc.graph) })}>
            Tidy up
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={!past.length} onClick={() => {
          const previous = past[past.length - 1];
          if (!previous) return;
          setPast((items) => items.slice(0, -1));
          setFuture((items) => [doc, ...items]);
          setDoc(previous);
        }}>
          Undo
        </Button>
        <Button type="button" variant="secondary" disabled={!future.length} onClick={() => {
          const next = future[0];
          if (!next) return;
          setFuture((items) => items.slice(1));
          setPast((items) => [...items, doc]);
          setDoc(next);
        }}>
          Redo
        </Button>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {mode === "compare" && changes ? (
        <p className="text-sm">
          {changes.added.length} added, {changes.removed.length} removed, {changes.changed.length} changed.
        </p>
      ) : null}
      <div className={view === "picture" ? "block" : "hidden md:block"}>
        {view === "picture" || mode !== "design" ? (
          <WorkflowCanvas graph={doc.graph} selectedId={selected} onSelect={setSelected} counts={mode === "live" ? liveCounts : undefined} readOnly={!canEdit || mode !== "design"} />
        ) : null}
      </div>
      <div className={view === "list" ? "block" : "hidden"}>
        <WorkflowOutline graph={doc.graph} selectedId={selected} onSelect={setSelected} counts={mode === "live" ? liveCounts : undefined} />
        {canEdit && box ? (
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => {
              const moved = moveBox(doc.graph, box.id, "up");
              if (moved.error) setMessage(moved.error);
              else commit({ ...doc, graph: moved.graph });
            }}>
              Move up
            </Button>
            <Button type="button" variant="secondary" onClick={() => {
              const moved = moveBox(doc.graph, box.id, "down");
              if (moved.error) setMessage(moved.error);
              else commit({ ...doc, graph: moved.graph });
            }}>
              Move down
            </Button>
          </div>
        ) : null}
      </div>
      {box ? <Settings box={box} issues={issues.errors.filter((issue) => issue.boxId === box.id)} warnings={issues.warnings.filter((issue) => issue.boxId === box.id)} canEdit={canEdit} onChange={(next) => commit({ ...doc, graph: { ...doc.graph, boxes: doc.graph.boxes.map((item) => (item.id === next.id ? next : item)) } })} /> : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => run(() => saveWorkflow(id, doc))}>
            Save as draft
          </Button>
        </div>
      ) : null}
      {canPublish || canPropose || canConfirm ? (
        <form
          className="space-y-2 rounded-xl border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => (canConfirm && status === "pending_confirmation" ? confirmWorkflow(id) : publishWorkflow(id, note, 0)));
          }}
        >
          <p className="text-sm font-medium">{name}</p>
          <label className="block text-sm" htmlFor="publish-note">
            Note for this version
            <input id="publish-note" value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" required minLength={2} />
          </label>
          <p className="text-sm text-muted-foreground">Publishing does not enroll people who are already here. Every message still waits for approval.</p>
          {!issues.ok ? <p className="text-sm text-destructive">{issues.errors[0]?.message}</p> : null}
          <Button type="submit" disabled={pending || !issues.ok}>
            {status === "pending_confirmation" && canConfirm ? "Confirm and publish" : canPublish ? "Publish" : "Send to the Owner"}
          </Button>
        </form>
      ) : null}
      {canEnroll && status === "published" ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => enrollExisting(id))}>
          Enroll existing leads
        </Button>
      ) : null}
      {canPublish && status === "published" ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => pauseWorkflow(id, true))}>
          Pause
        </Button>
      ) : null}
    </div>
  );
}

function Settings({ box, issues, warnings, canEdit, onChange }: { box: Box; issues: CheckIssue[]; warnings: CheckIssue[]; canEdit: boolean; onChange: (box: Box) => void }) {
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Step settings">
      <h2 className="text-sm font-medium">{box.title}</h2>
      <p className="text-sm text-muted-foreground">{previewLine(box)}</p>
      {box.fact ? <p className="text-sm">{box.fact}</p> : null}
      {box.type === "draft" ? <p className="text-sm">{QUIET_HOURS_NOTE}</p> : null}
      {canEdit ? (
        <label className="block text-sm" htmlFor="step-title">
          Title
          <input id="step-title" value={box.title} onChange={(event) => onChange({ ...box, title: event.target.value, origin: "person" })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
        </label>
      ) : null}
      {issues.map((issue) => (
        <p key={issue.message} className="text-sm text-destructive">{issue.message}</p>
      ))}
      {warnings.map((issue) => (
        <p key={issue.message} className="text-sm text-muted-foreground">{issue.message}</p>
      ))}
    </section>
  );
}
