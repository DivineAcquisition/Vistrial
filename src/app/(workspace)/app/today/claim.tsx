"use client";

import { useState, useTransition } from "react";

import { claimLead } from "@/lib/routing/claim";

export function ClaimLeadButton({ leadId }: { leadId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="text-right">
      <button
        type="button"
        className="rounded-md border border-border px-4 py-3 text-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await claimLead(leadId);
            setMessage(result.ok ? "Yours." : result.error);
          })
        }
      >
        Claim
      </button>
      {message ? <p className="mt-1 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
