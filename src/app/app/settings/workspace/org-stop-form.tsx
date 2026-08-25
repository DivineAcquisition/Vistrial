"use client";

import { useActionState } from "react";

import { setOrgSequenceHaltForm } from "@/app/app/settings/follow-up/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { SubmitButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { ORG_STOP_EFFECT } from "@/lib/settings/constants";
import { errorClass, helperClass, successClass } from "@/lib/ui";

const idle: SettingsSaveResult = { status: "idle" };

export function OrgStopForm({ halted }: { halted: boolean }) {
  const [state, action, pending] = useActionState(setOrgSequenceHaltForm, idle);

  return (
    <div className="space-y-4">
      {halted ? (
        <Notice tone="critical" title="Outbound is stopped">
          Sequences and dispatch are stopped for the whole organization. Nothing further will send
          until you resume.
        </Notice>
      ) : null}
      <p className={helperClass}>{ORG_STOP_EFFECT}</p>
      <form action={action}>
        <input type="hidden" name="halted" value={halted ? "false" : "true"} />
        <SubmitButton variant={halted ? "primary" : "destructive"} pending={pending}>
          {halted ? "Resume sequences and dispatch" : "Stop all sequences and dispatch"}
        </SubmitButton>
      </form>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
      {state.status === "saved" ? <p className={successClass}>Saved.</p> : null}
    </div>
  );
}
