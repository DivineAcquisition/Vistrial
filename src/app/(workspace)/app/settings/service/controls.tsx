"use client";

import { useState, useTransition } from "react";

import { setStaffApproval } from "@/app/(workspace)/app/settings/service/actions";
import { Button } from "@/components/ui/button";
import { errorClass, helperClass } from "@/lib/ui";

export function ServiceControls({ orgId, allowed }: { orgId: string; allowed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <p className="text-sm text-strong">
        {allowed
          ? "The Vistrial team can approve drafts in this workspace. Approvals are labeled as the Vistrial team."
          : "The Vistrial team cannot approve drafts here. This is the default."}
      </p>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setStaffApproval(orgId, !allowed);
            setError(result.ok ? null : result.error);
          })
        }
      >
        {allowed ? "Turn staff approvals off" : "Let the Vistrial team approve"}
      </Button>
      <p className={helperClass}>The permission is checked again at the moment of approval.</p>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
