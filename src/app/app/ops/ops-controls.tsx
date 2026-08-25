"use client";

import { useState } from "react";

import {
  deleteOrg,
  haltOrgDispatch,
  offboardOrg,
  recordIncident,
  recordRestoreDrill,
  runRetentionNow,
  setOrgManaged,
  type OpsActionResult,
} from "@/app/app/ops/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorClass, helperClass, successClass } from "@/lib/ui";

type OrgOption = { id: string; name: string; slug: string; managed: boolean };

function ResultLine({ result }: { result: OpsActionResult }) {
  if (result.status === "error") return <p className={errorClass}>{result.error}</p>;
  if (result.status === "ok") return <p className={successClass}>{result.message}</p>;
  return null;
}

export function OpsControls({ orgs }: { orgs: OrgOption[] }) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [result, setResult] = useState<OpsActionResult>({ status: "idle" });
  const selected = orgs.find((org) => org.id === orgId);

  return (
    <div className="space-y-6">
      <Field label="Workspace" name="ops-org" help="Every control below applies to this workspace unless it says otherwise.">
        <Select name="ops-org" id="ops-org" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
              {org.managed ? " (managed)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <a href={orgId ? `/app/ops/export?orgId=${orgId}` : "#"}>Download export</a>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            if (!orgId) return;
            setResult(await haltOrgDispatch(orgId));
          }}
        >
          Halt dispatch
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => setResult(await runRetentionNow(true))}
        >
          Retention dry-run
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => setResult(await runRetentionNow(false))}
        >
          Run retention
        </Button>
      </div>
      <p className={helperClass}>
        Halt dispatch is the Prompt 10 org-wide stop. Use it first on a dispatch-in-error. Export is
        JSON, one workspace, no engineering ticket. Managed mode is attributed to you in that
        client&apos;s activity log.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            if (!orgId) return;
            setResult(await setOrgManaged(orgId, true));
          }}
        >
          Mark as managed
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            if (!orgId) return;
            setResult(await setOrgManaged(orgId, false));
          }}
        >
          Release managed mode
        </Button>
      </div>
      <p className={helperClass}>
        {selected?.managed
          ? "This workspace is managed. Advanced is read-only for the client until they take over or you release it."
          : "This workspace is not managed. The client can change Advanced settings."}
      </p>

      <form
        className="space-y-3"
        action={async (formData) => {
          formData.set("orgId", orgId);
          setResult(await offboardOrg(formData));
        }}
      >
        <Field
          label="Offboard reason"
          name="reason"
          help="Disconnects CRM, revokes tokens, halts sequences, keeps data for 30 days."
        >
          <Input name="reason" id="reason" required maxLength={240} />
        </Field>
        <Button type="submit" variant="secondary" size="sm">
          Offboard workspace
        </Button>
      </form>

      <ConfirmDialog
        trigger={
          <Button type="button" variant="destructive" size="sm">
            Delete workspace data
          </Button>
        }
        title="Delete this workspace permanently"
        description="Type the exact workspace name. This removes every row, including baseline and notifications, then recomputes cross-client aggregates. A deletion record survives."
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const form = document.getElementById("ops-delete-form") as HTMLFormElement | null;
          if (!form) return;
          setResult(await deleteOrg(new FormData(form)));
        }}
      >
        <form id="ops-delete-form" className="space-y-3">
          <input type="hidden" name="orgId" value={orgId} />
          <Field
            label="Type the workspace name"
            name="confirmationName"
            help={selected ? `Must match “${selected.name}” exactly.` : undefined}
          >
            <Input name="confirmationName" id="confirmationName" required />
          </Field>
          <Field label="Why" name="reason">
            <Input name="reason" id="delete-reason" required maxLength={240} />
          </Field>
        </form>
      </ConfirmDialog>

      <form
        className="space-y-3"
        action={async (formData) => setResult(await recordRestoreDrill(formData))}
      >
        <Field label="Restore duration (ms)" name="durationMs" help="Paste the number from scripts/restore-drill.sh.">
          <Input name="durationMs" id="durationMs" type="number" min={1} required />
        </Field>
        <Field label="Source label" name="sourceLabel">
          <Input name="sourceLabel" id="sourceLabel" defaultValue="local-pg-restore" />
        </Field>
        <Field label="Notes" name="notes">
          <Input name="notes" id="notes" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="verified" defaultChecked />
          Integrity verified across leads, touches, scores, transcripts, extractions, revenue, baseline
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Record restore drill
        </Button>
      </form>

      <form className="space-y-3" action={async (formData) => {
        formData.set("orgId", orgId);
        setResult(await recordIncident(formData));
      }}>
        <Field label="Incident kind" name="kind">
          <Select name="kind" id="kind" defaultValue="dispatch_in_error">
            <option value="ingest_one">Ingestion stopped for one client</option>
            <option value="ingest_all">Ingestion stopped for all clients</option>
            <option value="crm_outage">CRM API outage</option>
            <option value="model_outage">Model API outage</option>
            <option value="dispatch_in_error">Messages dispatched in error</option>
            <option value="database_unavailable">Database unavailable</option>
            <option value="metric_corruption">Data corruption in a shown metric</option>
            <option value="unauthorized_access">Suspected unauthorized access</option>
          </Select>
        </Field>
        <Field label="Title" name="title">
          <Input name="title" id="title" required />
        </Field>
        <Field label="Cause" name="cause">
          <Textarea name="cause" id="cause" required rows={2} />
        </Field>
        <Field label="Impact" name="impact">
          <Textarea name="impact" id="impact" required rows={2} />
        </Field>
        <Field label="What changed to prevent recurrence" name="prevention">
          <Textarea name="prevention" id="prevention" required rows={2} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="clientNotified" />
          Client was told
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Record incident
        </Button>
      </form>

      <ResultLine result={result} />
    </div>
  );
}
