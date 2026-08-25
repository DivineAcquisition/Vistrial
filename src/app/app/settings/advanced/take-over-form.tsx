"use client";

import { takeOverManagement } from "@/app/app/settings/advanced/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { errorClass, helperClass, successClass } from "@/lib/ui";
import { useActionState } from "react";

const idle: SettingsSaveResult = { status: "idle" };

export function TakeOverForm() {
  const [state, action, pending] = useActionState(takeOverManagement, idle);
  return (
    <form action={action} className="space-y-3">
      <p className={helperClass}>
        Taking over unlocks Advanced for this workspace. You become responsible for scoring, routing,
        and contact rules. The change is recorded.
      </p>
      <SubmitButton pending={pending}>Take over management</SubmitButton>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
      {state.status === "saved" ? <p className={successClass}>Advanced is now yours to change.</p> : null}
    </form>
  );
}
