"use client";

import { useState, useTransition } from "react";

import { enterWorkspace } from "@/app/(workspace)/app/team/staff-actions";
import { Button } from "@/components/ui/button";
import { errorClass } from "@/lib/ui";

export function EnterForm({ orgId, next }: { orgId: string; next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await enterWorkspace(orgId, next);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Opening" : "Enter workspace"}
      </Button>
      <p className="text-xs text-muted-foreground">You will confirm it is you if the last check was more than 15 minutes ago.</p>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
