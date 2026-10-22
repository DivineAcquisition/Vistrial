"use client";

import { useState, useTransition } from "react";

import { confirmEodAction, draftTodayAction, setTeamManagerAction } from "@/app/(workspace)/app/manager/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

export function ManagerSwitch({ memberId, name, on }: { memberId: string; name: string; on: boolean }) {
  const [checked, setChecked] = useState(on);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        aria-label={`${name} is a Manager`}
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) => {
          setChecked(next);
          start(async () => {
            const result = await setTeamManagerAction(memberId, next);
            if (!result.ok) setChecked(!next);
            setMessage(result.message ?? null);
          });
        }}
      />
      {message ? (
        <p role="status" className="max-w-56 text-right text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
