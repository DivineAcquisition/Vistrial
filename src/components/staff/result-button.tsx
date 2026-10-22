"use client";

import { useState, useTransition, type ReactNode } from "react";

import type { StaffResult } from "@/app/(workspace)/app/team/staff-actions";
import { Button } from "@/components/ui/button";
import { errorClass, helperClass } from "@/lib/ui";

export function ResultButton({
  label,
  action,
  variant = "secondary",
}: {
  label: string;
  action: () => Promise<StaffResult>;
  variant?: "secondary" | "primary" | "destructive" | "outline";
}) {
  const [result, setResult] = useState<StaffResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant={variant} disabled={pending} onClick={() => startTransition(async () => setResult(await action()))}>
        {label}
      </Button>
      {result && !result.ok ? <span className={errorClass}>{result.error}</span> : null}
      {result && result.ok && result.message ? <span className={helperClass}>{result.message}</span> : null}
    </span>
  );
}

export function NoteBox({
  label,
  action,
  placeholder,
}: {
  label: string;
  placeholder?: string;
  action: (note: string) => Promise<StaffResult>;
}) {
  const [note, setNote] = useState("");
  const [result, setResult] = useState<StaffResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setResult(await action(note)));
      }}
    >
      <label className="block text-sm text-card-foreground">
        {label}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={placeholder}
          rows={3}
          maxLength={2000}
          className="mt-1 w-full rounded-lg border border-overlay/[0.09] bg-transparent px-3 py-2 text-sm text-strong"
        />
      </label>
      <Button type="submit" size="sm" disabled={pending || !note.trim()}>
        Save
      </Button>
      {result && !result.ok ? <p className={errorClass}>{result.error}</p> : null}
    </form>
  );
}

export function FieldNote({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}
