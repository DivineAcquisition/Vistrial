"use client";

import { useState, useTransition } from "react";

import { createTask, setTaskStatus } from "@/lib/tasks/actions";

export function TaskQuickAdd() {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<"later_today" | "tomorrow_morning" | "in_3_days">("tomorrow_morning");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createTask({ title, dueChoice: due, type: "follow_up" });
          if (!result.ok) setError(result.error);
          else setTitle("");
        });
      }}
    >
      <label className="text-sm">
        New task
        <input
          className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-3 text-base"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Call back about the quote"
          required
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["later_today", "Later today"],
            ["tomorrow_morning", "Tomorrow morning"],
            ["in_3_days", "In 3 days"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={due === value ? "rounded-full bg-foreground px-3 py-2 text-sm text-background" : "rounded-full border border-border px-3 py-2 text-sm"}
            onClick={() => setDue(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <button className="w-fit rounded-md border border-border px-4 py-3 text-sm" type="submit" disabled={pending}>
        Add task
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

export function TaskButtons({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="rounded-md border border-border px-3 py-2 text-sm"
        disabled={pending}
        onClick={() => startTransition(async () => { await setTaskStatus({ id, status: "done" }); })}
      >
        Done
      </button>
      <button
        type="button"
        className="rounded-md border border-border px-3 py-2 text-sm"
        disabled={pending}
        onClick={() => startTransition(async () => { await setTaskStatus({ id, status: "snoozed", snooze: "tomorrow_morning" }); })}
      >
        Tomorrow
      </button>
      <button
        type="button"
        className="rounded-md border border-border px-3 py-2 text-sm"
        disabled={pending}
        onClick={() => startTransition(async () => { await setTaskStatus({ id, status: "canceled", reason: "No longer needed" }); })}
      >
        Cancel
      </button>
    </div>
  );
}
