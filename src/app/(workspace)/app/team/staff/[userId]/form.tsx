"use client";

import { useState, useTransition } from "react";

import { deactivateWithHandover } from "@/app/(workspace)/app/team/staff-actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { errorClass, helperClass } from "@/lib/ui";

export function HandoverForm({
  userId,
  workspaces,
  people,
}: {
  userId: string;
  workspaces: Array<{ org_id: string; name: string }>;
  people: Array<{ user_id: string; display_name: string }>;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      {workspaces.map((workspace) => (
        <label key={workspace.org_id} className="block text-sm text-strong">
          {workspace.name}
          <Select
            className="mt-1"
            value={choices[workspace.org_id] ?? ""}
            onChange={(event) => setChoices((current) => ({ ...current, [workspace.org_id]: event.target.value }))}
            options={[{ value: "", label: "Leave with Platform Admins" }, ...people.map((person) => ({ value: person.user_id, label: person.display_name }))]}
          />
        </label>
      ))}
      {workspaces.length === 0 ? <p className={helperClass}>No open workspace assignments.</p> : null}
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deactivateWithHandover(userId, choices);
            if (result.ok) setMessage(result.message ?? "Done.");
            else setError(result.error);
          })
        }
      >
        Hand over and deactivate
      </Button>
      {message ? <p className={helperClass}>{message}</p> : null}
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
