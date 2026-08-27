"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Command as CommandIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { OPERATOR_OPEN_RUN_EVENT } from "@/components/operator/open-run-button";
import { RunContainer, runStatusLabel } from "@/components/operator/run-container";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  cancelOperatorWriteAction,
  confirmOperatorWriteAction,
  listOperatorRunsAction,
  loadOperatorRunAction,
  undoOperatorWriteAction,
} from "@/app/app/operator/actions";
import type { OperatorConfirmationView, OperatorRunSummary, OperatorRunView, OperatorStepView } from "@/lib/operator/types";
import { helperClass } from "@/lib/ui";

type LiveStep = OperatorStepView;

function mergeStep(steps: LiveStep[], incoming: Partial<LiveStep> & { id: string }): LiveStep[] {
  const existing = steps.find((step) => step.id === incoming.id);
  const next: LiveStep = {
    id: incoming.id,
    seq: incoming.seq ?? existing?.seq ?? 0,
    toolName: incoming.toolName ?? existing?.toolName ?? "",
    label: incoming.label ?? existing?.label ?? "",
    arguments: incoming.arguments ?? existing?.arguments ?? {},
    result: incoming.result ?? existing?.result ?? null,
    resultSummary: incoming.resultSummary ?? existing?.resultSummary ?? null,
    state: incoming.state ?? existing?.state ?? "running",
    errorKind: incoming.errorKind ?? existing?.errorKind ?? null,
    errorText: incoming.errorText ?? existing?.errorText ?? null,
    startedAt: incoming.startedAt ?? existing?.startedAt ?? new Date().toISOString(),
    finishedAt: incoming.finishedAt ?? existing?.finishedAt ?? null,
    durationMs: incoming.durationMs ?? existing?.durationMs ?? null,
    ui: incoming.ui ?? existing?.ui ?? null,
  };
  if (existing) return steps.map((step) => (step.id === incoming.id ? next : step));
  return [...steps, next];
}

async function readSse(
  response: Response,
  handlers: {
    onRun: (id: string) => void;
    onText: (delta: string) => void;
    onStep: (step: Partial<LiveStep> & { id: string }) => void;
    onConfirmation: (confirmation: OperatorConfirmationView) => void;
    onError: (message: string) => void;
  }
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No stream.");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((row) => row.startsWith("data:"));
      if (!line) continue;
      const payload = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      if (payload.type === "run" && typeof payload.id === "string") handlers.onRun(payload.id);
      if (payload.type === "text" && typeof payload.delta === "string") handlers.onText(payload.delta);
      if (payload.type === "step" && payload.step && typeof payload.step === "object") {
        handlers.onStep(payload.step as Partial<LiveStep> & { id: string });
      }
      if (payload.type === "confirmation" && payload.confirmation) {
        handlers.onConfirmation(payload.confirmation as OperatorConfirmationView);
      }
      if (payload.type === "error" && typeof payload.message === "string") handlers.onError(payload.message);
    }
  }
}

export function OperatorCommandBar() {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<OperatorRunView | null>(null);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [confirmations, setConfirmations] = useState<OperatorConfirmationView[]>([]);
  const [streamed, setStreamed] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [history, setHistory] = useState<OperatorRunSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const refreshHistory = useCallback(async () => {
    const rows = await listOperatorRunsAction();
    setHistory(rows);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) void refreshHistory();
  }, [open, refreshHistory]);

  const resetLive = () => {
    setSteps([]);
    setConfirmations([]);
    setStreamed("");
    setError(null);
    setRun(null);
  };

  const hydrate = useCallback(async (id: string) => {
    const next = await loadOperatorRunAction(id);
    if (next) {
      setRun(next);
      setSteps(next.steps);
      setConfirmations(next.confirmations);
      setStreamed((current) => next.finalResponse ?? current);
    }
    return next;
  }, []);

  useEffect(() => {
    function onOpenRun(event: Event) {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setOpen(true);
      setShowHistory(false);
      setRunId(id);
      void hydrate(id);
    }
    window.addEventListener(OPERATOR_OPEN_RUN_EVENT, onOpenRun);
    return () => window.removeEventListener(OPERATOR_OPEN_RUN_EVENT, onOpenRun);
  }, [hydrate]);

  const startStream = async (url: string, body: unknown, seedId: string | null = null) => {
    setBusy(true);
    setStreaming(true);
    setError(null);
    let currentId: string | null = seedId;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 429) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Rate limited.");
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not start that run.");
        return;
      }
      await readSse(response, {
        onRun: (id) => {
          currentId = id;
          setRunId(id);
        },
        onText: (delta) => setStreamed((current) => current + delta),
        onStep: (step) => setSteps((current) => mergeStep(current, step)),
        onConfirmation: (confirmation) =>
          setConfirmations((current) => {
            const rest = current.filter((row) => row.id !== confirmation.id);
            return [...rest, confirmation];
          }),
        onError: (message) => setError(message),
      });
      if (currentId) await hydrate(currentId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The run failed.");
    } finally {
      setStreaming(false);
      setBusy(false);
      void refreshHistory();
    }
  };

  const onSubmit = async () => {
    const text = request.trim();
    if (!text || busy) return;
    resetLive();
    setShowHistory(false);
    setRequest("");
    setRunId(null);
    await startStream("/api/operator/runs", { request: text });
  };

  const continueRun = async (id: string, decisionNote?: string, followUp?: string) => {
    setStreamed("");
    await startStream(`/api/operator/runs/${id}/continue`, { decisionNote, followUp }, id);
  };

  const onConfirm = async (confirmationId: string, selectedIds: string[]) => {
    if (!runId) return;
    setBusy(true);
    const result = await confirmOperatorWriteAction({ runId, confirmationId, selectedIds });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    await hydrate(runId);
    if (result.remainingPending === 0) {
      const note = `The operator confirmed write ${confirmationId}. Succeeded: ${result.report.succeeded.length}. Failed: ${result.report.failed.length}. Not attempted: ${result.report.notAttempted.length}. Cancelled writes changed nothing. Do not invent facts.`;
      await continueRun(runId, note);
    } else {
      setBusy(false);
    }
  };

  const onCancel = async (confirmationId: string) => {
    if (!runId) return;
    setBusy(true);
    const result = await cancelOperatorWriteAction({ runId, confirmationId });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    await hydrate(runId);
    if (result.remainingPending === 0) {
      await continueRun(
        runId,
        `The operator cancelled write ${confirmationId}. Nothing was changed. Do not claim it happened.`
      );
    } else {
      setBusy(false);
    }
  };

  const onUndo = async (confirmationId: string) => {
    if (!runId) return;
    setBusy(true);
    const result = await undoOperatorWriteAction({ runId, confirmationId });
    if (!result.ok) setError(result.error);
    await hydrate(runId);
    setBusy(false);
  };

  const historyItems = useMemo(
    () =>
      history.map((row) => ({
        value: row.id,
        label: row.requestText,
        status: row.status,
      })),
    [history]
  );

  const requestText = run?.requestText ?? request;
  const followUpEnabled = run?.status === "completed" && !run.followUpUsed && !streaming;

  const statusLabel = useMemo(() => {
    if (error) return error;
    if (run) return runStatusLabel(run);
    return null;
  }, [error, run]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label="Open operator agent"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setOpen(true)}
      >
        <CommandIcon className="size-4" aria-hidden />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 bg-ink-900 p-0 text-white sm:max-w-xl"
          showCloseButton
        >
          <SheetHeader className="border-b border-white/[0.07]">
            <SheetTitle>Operator agent</SheetTitle>
            <SheetDescription>
              One task at a time. Writes wait for confirmation. Not a chat.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onSubmit();
              }}
            >
              <label className="block">
                <span className="sr-only">Request</span>
                <Textarea
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  rows={3}
                  placeholder="Which leads went quiet after one call this month?"
                  disabled={busy}
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={busy || !request.trim()}>
                  Run
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory((value) => !value)}
                >
                  {showHistory ? "Hide history" : "History"}
                </Button>
                <span className={helperClass}>⌘K</span>
              </div>
            </form>

            {error ? <p className="mt-3 text-sm text-flag-critical">{error}</p> : null}

            {showHistory ? (
              <div className="mt-4 min-h-0 flex-1">
                <Command items={historyItems}>
                  <CommandInput placeholder="Search runs" />
                  <CommandEmpty>
                    {history.length === 0 ? "No runs yet." : "No matching runs."}
                  </CommandEmpty>
                  <CommandList className="max-h-80">
                    {(item) => (
                      <CommandItem
                        key={item.value}
                        value={item}
                        className="mb-2 flex-col items-start rounded-xl border border-white/[0.08] px-3 py-2"
                        onClick={() => {
                          setShowHistory(false);
                          setRunId(item.value);
                          void hydrate(item.value);
                        }}
                      >
                        <span className="text-white">{item.label}</span>
                        <span className={helperClass}>{item.status}</span>
                      </CommandItem>
                    )}
                  </CommandList>
                </Command>
              </div>
            ) : runId || streaming ? (
              <div className="mt-4 flex min-h-0 flex-1 flex-col">
                <RunContainer
                  requestText={run?.requestText ?? requestText}
                  steps={steps}
                  confirmations={confirmations}
                  streamedText={streamed}
                  finalResponse={run?.finalResponse ?? null}
                  streaming={streaming}
                  statusLabel={statusLabel}
                  busy={busy}
                  followUp={{ used: Boolean(run?.followUpUsed), enabled: Boolean(followUpEnabled) }}
                  onConfirm={onConfirm}
                  onCancel={onCancel}
                  onUndo={onUndo}
                  onFollowUp={(text) => {
                    if (runId) void continueRun(runId, undefined, text);
                  }}
                />
                {runId &&
                run?.status === "awaiting_confirmation" &&
                confirmations.length > 0 &&
                confirmations.every((row) => row.decision !== "pending") &&
                !streaming ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void continueRun(runId)}
                    >
                      Continue
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={`mt-6 ${helperClass}`}>
                Ask about leads, queue, scores, objections, or reporting. Assignment and other writes
                show a preview first.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
