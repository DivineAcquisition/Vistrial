"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CommandBar() {
  const fieldId = useId();
  const [reply, setReply] = useState("");

  return (
    <form
      className="grid min-w-0 gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const text = String(data.get("ask") ?? "").trim();
        if (!text) return;
        setReply("Compass is not on yet.");
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <label className="sr-only" htmlFor={fieldId}>
          Ask Compass anything or tell it what to do
        </label>
        <Input
          id={fieldId}
          name="ask"
          placeholder="Ask Compass anything or tell it what to do"
          autoComplete="off"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary">
          Ask
        </Button>
      </div>
      {reply ? (
        <p role="status" className="text-sm text-muted-foreground">
          {reply}
        </p>
      ) : null}
    </form>
  );
}
