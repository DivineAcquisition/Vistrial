"use client";

import { useId, useState } from "react";

import { Check, MessageSquareText, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";

import type { ReviewActions } from "./types";

type Mode = "idle" | "changes" | "reject";

/**
 * Approve, request changes or reject one draft, with the existing asset mutations. Changes and rejections
 * need a reason in the owner's words; the agent reads it next time.
 */
export function ReviewBar({ assetId, actions, needsReview }: { assetId: string; actions: ReviewActions; needsReview: boolean }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const id = useId();

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem("");
    try {
      await work();
      setMode("idle");
      setReason("");
    } catch (error) {
      setProblem(showError(error, "That did not save."));
    } finally {
      setBusy(false);
    }
  };

  if (mode !== "idle") {
    return (
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!reason.trim()) return;
          void run(() => (mode === "reject" ? actions.reject(assetId, reason) : actions.requestChanges(assetId, reason)));
        }}
      >
        <label htmlFor={`${id}-reason`} className="text-xs text-muted-foreground">
          {mode === "reject" ? "Why reject it? The agent reads this next time." : "What should change? Be specific; the agent reads this."}
        </label>
        <Textarea id={`${id}-reason`} rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" variant={mode === "reject" ? "destructive" : "primary"} disabled={busy || !reason.trim()}>
            {mode === "reject" ? "Reject" : "Send for changes"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
        {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
      </form>
    );
  }

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-2">
        {needsReview ? null : (
          <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => actions.approve(assetId))}>
            <Check aria-hidden className="size-4" /> Approve
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setMode("changes")}>
          <MessageSquareText aria-hidden className="size-4" /> Request changes
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMode("reject")}>
          <X aria-hidden className="size-4" /> Reject
        </Button>
      </div>
      {needsReview ? <p className="text-xs text-muted-foreground">It did not pass every check, so it needs changes before it can be approved.</p> : null}
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </div>
  );
}
