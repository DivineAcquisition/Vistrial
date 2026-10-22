"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { FlaskConicalIcon, LayoutGridIcon, MaximizeIcon, Redo2Icon, Undo2Icon } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { BoxSettings } from "@/components/workflows/box-settings";
import { OutlineEditor } from "@/components/workflows/outline-editor";
import { PublishChecks } from "@/components/workflows/publish-checks";
import { TestRun } from "@/components/workflows/test-run";
import { WorkflowCanvas, type CanvasHandlers, type ViewRequest } from "@/components/workflows/workflow-canvas";
import { useMediaQuery } from "@/hooks/use-media-query";
import { checkWorkflow } from "@/lib/workflows/checker";
import { addBox, connectExit, removeBox, removeEdge, setLoopPasses, updateBox, type AddableKind } from "@/lib/workflows/edit";
import { toCheckContext, type EditorContext } from "@/lib/workflows/editor-context";
import type { Positions } from "@/lib/workflows/flow";
import { boxById } from "@/lib/workflows/graph";
import { createHistory, pushHistory, redoHistory, undoHistory } from "@/lib/workflows/history";
import { choicesToReach, formatLeadTime, simulateWorkflow } from "@/lib/workflows/simulate";
import { DEFAULT_LIMITS, type EdgeExit, type WorkflowGraph } from "@/lib/workflows/types";
import { captionText, labelClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type SaveResult = { ok: true } | { ok: false; message: string };

type SaveState = "preview" | "saved" | "unsaved" | "saving" | "error";
type PanelKind = "settings" | "test" | "checks";

const SAVE_WORDS: Record<SaveState, string> = {
  preview: "Preview. Changes are not saved.",
  saved: "Draft saved",
  unsaved: "Unsaved changes",
  saving: "Saving",
  error: "Not saved",
};

/**
 * Design mode for one workflow: the AI Elements canvas on desktop and tablet,
 * the outline on a phone, one settings panel, and a test run. The graph is the
 * only state that matters; every view is drawn from it. Saving keeps a draft.
 * Nothing here publishes or runs anything.
 */
export function WorkflowEditor(props: {
  initialGraph: WorkflowGraph;
  ctx: EditorContext;
  timeZone: string;
  /** ISO time the page was drawn, so the server and browser agree on "now". */
  now: string;
  editable: boolean;
  onSave?: (graph: WorkflowGraph) => Promise<SaveResult>;
}) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}

function EditorInner({
  initialGraph,
  ctx,
  timeZone,
  now,
  editable,
  onSave,
}: {
  initialGraph: WorkflowGraph;
  ctx: EditorContext;
  timeZone: string;
  now: string;
  editable: boolean;
  onSave?: (graph: WorkflowGraph) => Promise<SaveResult>;
}) {
  const wide = useMediaQuery("md");
  const roomy = useMediaQuery("lg");
  const [history, setHistory] = useState(() => createHistory(initialGraph));
  const graph = history.present;
  const [positions, setPositions] = useState<Positions>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewChoice, setViewChoice] = useState<"canvas" | "outline" | null>(null);
  const [panel, setPanel] = useState<PanelKind>("checks");
  const [save, setSave] = useState<SaveState>(onSave ? "saved" : "preview");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [viewRequest, setViewRequest] = useState<ViewRequest>({ kind: "home", n: 0 });
  const timer = useRef<number | null>(null);
  const nowDate = useMemo(() => new Date(now), [now]);

  const view = viewChoice ?? (wide ? "canvas" : "outline");
  const canvasEditable = editable && wide;
  const checkCtx = useMemo(() => toCheckContext(ctx), [ctx]);
  const issues = useMemo(() => checkWorkflow(graph, checkCtx).issues, [graph, checkCtx]);
  const errorCount = new Set(issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.boxId}:${issue.message}`)).size;
  const selected = selectedId ? boxById(graph, selectedId) : undefined;

  const preview = useMemo(() => {
    if (!selected || selected.config.kind === "note") return null;
    const run = simulateWorkflow(graph, { start: nowDate, lead: { name: "Jordan", timeZone }, choices: choicesToReach(graph, selected.id) });
    const step = run.steps.find((item) => item.boxId === selected.id);
    if (!step) return null;
    if (selected.config.kind === "check") {
      return `For a test lead entering now, this is asked ${formatLeadTime(step.at, timeZone)}, the lead's time. "${selected.config.yesLabel}" and "${selected.config.noLabel}" each lead to their own next step.`;
    }
    return `For a test lead entering now: ${step.sentence}`;
  }, [graph, selected, nowDate, timeZone]);

  function scheduleSave(next: WorkflowGraph) {
    if (!onSave) return;
    setSave("unsaved");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSave("saving");
      const result = await onSave(next).catch(() => ({ ok: false as const, message: "The draft could not be saved. Try again in a moment." }));
      setSave(result.ok ? "saved" : "error");
      setSaveMessage(result.ok ? null : result.message);
    }, 1200);
  }

  function commit(next: WorkflowGraph) {
    if (!editable || next === graph) return;
    setHistory((current) => pushHistory(current, next));
    scheduleSave(next);
  }

  function undo() {
    const next = undoHistory(history);
    if (next === history) return;
    setHistory(next);
    scheduleSave(next.present);
  }

  function redo() {
    const next = redoHistory(history);
    if (next === history) return;
    setHistory(next);
    scheduleSave(next.present);
  }

  function select(id: string | null) {
    setSelectedId(id);
    if (id) setPanel("settings");
  }

  function tidy() {
    setPositions({});
    setViewRequest((current) => ({ kind: "home", n: current.n + 1 }));
  }

  function add(kind: AddableKind, after?: { fromId: string; exit: EdgeExit }) {
    const added = addBox(graph, kind, after);
    commit(added.graph);
    select(added.id);
  }

  const handlers: CanvasHandlers = {
    onSelect: select,
    onMove: (id, position) => setPositions((current) => ({ ...current, [id]: position })),
    onConnect: (fromId, exit, toId) => commit(connectExit(graph, fromId, exit, toId)),
    onAdd: add,
    onRemoveBox: (id) => {
      commit(removeBox(graph, id));
      if (selectedId === id) setSelectedId(null);
    },
    onRemoveEdge: (id) => commit(removeEdge(graph, id)),
  };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      redo();
    }
  }

  const loops = selected ? graph.edges.filter((edge) => edge.from === selected.id && edge.maxPasses !== undefined) : [];
  const settings = selected ? (
    <div className="flex flex-col gap-5">
      <BoxSettings
        box={selected}
        ctx={ctx}
        issues={issues.filter((issue) => issue.boxId === selected.id)}
        preview={preview}
        readOnly={!editable}
        onChange={(config) => commit(updateBox(graph, selected.id, config))}
      />
      {loops.map((edge) => (
        <label key={edge.id} className="flex flex-col">
          <span className={labelClass}>Repeat this loop up to</span>
          <Input
            type="number"
            min={1}
            max={DEFAULT_LIMITS.maxLoopPasses}
            value={edge.maxPasses}
            disabled={!editable}
            onChange={(event) => {
              const passes = Math.round(Number(event.target.value));
              if (Number.isFinite(passes) && passes >= 1) commit(setLoopPasses(graph, edge.id, Math.min(passes, DEFAULT_LIMITS.maxLoopPasses)));
            }}
          />
          <span className={cn(captionText, "mt-1.5")}>Times, at most {DEFAULT_LIMITS.maxLoopPasses}. After that the lead leaves the workflow as Stopped.</span>
        </label>
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">Select a box to see and change its settings.</p>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedRadioGroup
          aria-label="Show the workflow as"
          value={view}
          options={[
            { value: "canvas", label: "Diagram" },
            { value: "outline", label: "List" },
          ]}
          onValueChange={(value) => setViewChoice(value as "canvas" | "outline")}
          className="w-auto"
        />
        {editable ? (
          <>
            <Button size="icon-sm" variant="ghost" onClick={undo} disabled={history.past.length === 0} aria-label="Undo">
              <Undo2Icon aria-hidden />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={redo} disabled={history.future.length === 0} aria-label="Redo">
              <Redo2Icon aria-hidden />
            </Button>
          </>
        ) : null}
        {view === "canvas" ? (
          <>
            <Button size="sm" variant="ghost" onClick={tidy}>
              <LayoutGridIcon aria-hidden />
              Tidy up
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setViewRequest((current) => ({ kind: "fit", n: current.n + 1 }))} className="max-sm:hidden">
              <MaximizeIcon aria-hidden />
              Fit
            </Button>
          </>
        ) : null}
        <span className={cn(captionText, "ml-auto", save === "error" && "text-destructive-foreground")} role="status" aria-live="polite">
          {save === "error" && saveMessage ? saveMessage : SAVE_WORDS[save]}
        </span>
        <button type="button" onClick={() => setPanel("checks")} className="rounded-full">
          <Badge variant={errorCount > 0 ? "error" : "success"}>{errorCount === 0 ? "Ready to publish" : errorCount === 1 ? "1 to fix" : `${errorCount} to fix`}</Badge>
        </button>
        <Button size="sm" variant="outline" onClick={() => setPanel("test")}>
          <FlaskConicalIcon aria-hidden />
          Test with a sample lead
        </Button>
      </div>

      {!wide && view === "canvas" ? <p className={captionText}>The diagram is read only on a phone. Switch to List to change a box.</p> : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {view === "canvas" ? (
            <WorkflowCanvas
              graph={graph}
              issues={issues}
              direction={wide ? "LR" : "TB"}
              editable={canvasEditable}
              positions={wide ? positions : {}}
              selectedId={selectedId}
              handlers={handlers}
              viewRequest={viewRequest}
              className="h-[60svh] min-h-[420px] overflow-hidden rounded-2xl border bg-background md:h-[70svh]"
            />
          ) : (
            <OutlineEditor
              graph={graph}
              issues={issues}
              selectedId={selectedId}
              editable={editable}
              onSelect={select}
              onChange={commit}
              onAdd={add}
              onRemove={handlers.onRemoveBox}
            />
          )}
        </div>

        <aside className="min-w-0 rounded-2xl border bg-card p-4 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto" aria-label="Workflow details">
          <SegmentedRadioGroup
            aria-label="Panel"
            value={panel}
            options={[
              { value: "settings", label: "Settings" },
              { value: "test", label: "Test run" },
              { value: "checks", label: "Checks" },
            ]}
            onValueChange={(value) => setPanel(value as PanelKind)}
            className="mb-4"
          />
          {panel === "settings" ? (roomy ? settings : <p className="text-sm text-muted-foreground">Select a box, or tap Edit on one, to open its settings.</p>) : null}
          {panel === "test" ? <TestRun graph={graph} defaultTimeZone={timeZone} now={nowDate} /> : null}
          {panel === "checks" ? <PublishChecks graph={graph} issues={issues} onSelect={select} /> : null}
        </aside>
      </div>

      {!roomy ? (
        <Sheet open={Boolean(selected) && panel === "settings"} onOpenChange={(open) => (open ? null : setSelectedId(null))}>
          <SheetPopup side={wide ? "right" : "bottom"} className={wide ? undefined : "max-h-[88svh] rounded-t-2xl"}>
            <SheetHeader>
              <SheetTitle>Box settings</SheetTitle>
            </SheetHeader>
            <SheetPanel className="overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">{settings}</SheetPanel>
          </SheetPopup>
        </Sheet>
      ) : null}
    </div>
  );
}
