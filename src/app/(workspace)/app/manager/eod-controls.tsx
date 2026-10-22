"use client";

import { useState, useTransition } from "react";

import { confirmEodAction, draftTodayAction } from "@/app/(workspace)/app/manager/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function DraftTodayButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await draftTodayAction();
            setMessage(result.message ?? null);
          })
        }
      >
        {pending ? "Drafting" : "Draft today's reports now"}
      </Button>
      {message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function ConfirmEodForm({ reportId }: { reportId: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await confirmEodAction(reportId, note);
          setMessage(result.message ?? null);
        });
      }}
    >
      <label htmlFor={`eod-note-${reportId}`} className="text-sm">
        Your notes (optional)
      </label>
      <Textarea
        id={`eod-note-${reportId}`}
        rows={3}
        maxLength={2000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Wins, blockers, what you need tomorrow."
      />
      <div>
        <Button type="submit" disabled={pending} className="min-h-11 sm:min-h-0">
          {pending ? "Confirming" : "Confirm my report"}
        </Button>
      </div>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </form>
  );
}
