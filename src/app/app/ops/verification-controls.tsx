"use client";

import { useState } from "react";

import {
  setVerificationTaskEnabled,
  submitVerificationSampleAudit,
  type OpsActionResult,
} from "@/app/app/ops/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorClass, helperClass, successClass } from "@/lib/ui";

type TaskRow = {
  task: string;
  enabled: boolean;
  disabledReason: string | null;
};

type PendingAudit = {
  id: string;
  task: string;
  orgId: string;
  createdAt: string;
};

function ResultLine({ result }: { result: OpsActionResult }) {
  if (result.status === "error") return <p className={errorClass}>{result.error}</p>;
  if (result.status === "ok") return <p className={successClass}>{result.message}</p>;
  return null;
}

export function VerificationControls({
  tasks,
  pendingAudits,
}: {
  tasks: TaskRow[];
  pendingAudits: PendingAudit[];
}) {
  const [result, setResult] = useState<OpsActionResult>({ status: "idle" });
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-6">
      <p className={helperClass}>
        Turn a task off when measured accuracy is poor. Deterministic checks still run. This never
        approves a draft or a write.
      </p>
      <Field label="Disable reason" name="verification-reason" help="Required to turn a task off.">
        <Input
          name="verification-reason"
          id="verification-reason"
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={240}
          placeholder="Accuracy below the bar on this week's sample"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {tasks.map((row) => (
          <Button
            key={row.task}
            type="button"
            variant={row.enabled ? "secondary" : "destructive"}
            size="sm"
            onClick={async () => {
              const data = new FormData();
              data.set("task", row.task);
              data.set("enabled", row.enabled ? "false" : "true");
              data.set("reason", reason);
              setResult(await setVerificationTaskEnabled(data));
            }}
          >
            {row.enabled ? `Turn off ${row.task}` : `Turn on ${row.task}`}
          </Button>
        ))}
      </div>
      {tasks
        .filter((row) => !row.enabled)
        .map((row) => (
          <p key={`${row.task}-off`} className={helperClass}>
            {row.task} is off{row.disabledReason ? `: ${row.disabledReason}` : "."}
          </p>
        ))}

      {pendingAudits.length ? (
        <div className="space-y-4">
          <p className={helperClass}>
            Passed output queued for human review. The missed-fault count is the verifier’s real
            accuracy.
          </p>
          {pendingAudits.map((row) => (
            <form
              key={row.id}
              className="space-y-2"
              action={async (formData) => {
                formData.set("id", row.id);
                setResult(await submitVerificationSampleAudit(formData));
              }}
            >
              <p className="text-sm text-silver">
                {row.task} · {row.orgId} · {new Date(row.createdAt).toLocaleString()}
              </p>
              <Field label="Missed faults" name="missedFaultCount">
                <Input name="missedFaultCount" type="number" min={0} required defaultValue={0} placeholder="0" />
              </Field>
              <Field label="Notes" name="notes">
                <Input name="notes" type="text" placeholder="What the verifier missed, if anything" />
              </Field>
              <Button type="submit" variant="secondary" size="sm">
                Record sample audit
              </Button>
            </form>
          ))}
        </div>
      ) : (
        <p className={helperClass}>No sample audits waiting.</p>
      )}
      <ResultLine result={result} />
    </div>
  );
}
