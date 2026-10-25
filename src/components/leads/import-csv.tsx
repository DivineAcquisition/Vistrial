"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { useConvexReady } from "@/components/providers/convex-ready";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { ChoiceRow, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const mapping = {
  email: "email",
  phone: "phone",
  firstName: "first_name",
  lastName: "last_name",
  displayName: "name",
  sourceId: "source_id",
  activityAt: "activity_at",
};

function reasonPhrase(code: string) {
  if (code === "phone_unreadable") return "The phone could not be read.";
  if (code === "missing_contact") return "No email or phone.";
  if (code === "missing_activity_time") return "No activity time.";
  return "";
}

export function ImportCsv() {
  const ready = useConvexReady();
  const shell = useWorkspaceShell();
  if (!ready || !shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return <LiveImport workspaceId={shell.workspaceId} role={shell.role} />;
}

function LiveImport({ workspaceId, role }: { workspaceId: Id<"workspaces">; role: "owner" | "manager" | "rep" }) {
  const [runId, setRunId] = useState<Id<"importRuns"> | null>(null);
  const [historic, setHistoric] = useState(true);
  const [countryCode, setCountryCode] = useState("US");
  const [error, setError] = useState("");
  const createUpload = useMutation(api.imports.createUpload);
  const start = useMutation(api.imports.start);
  const setCountry = useMutation(api.leads.setCountry);
  const country = useQuery(api.leads.country, { workspaceId });
  const run = useQuery(api.imports.getRun, runId ? { workspaceId, importRunId: runId } : "skip");

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-3xl gap-6">
      <PageHeader
        eyebrow="Import"
        title="Import a CSV"
        description="Map the columns, preview the counts, then run it. Imports are history unless you say these are new leads."
      />
      <Panel className="grid gap-4 p-6">
        <ChoiceRow
          control={
            <input
              type="checkbox"
              checked={!historic}
              onChange={(event) => setHistoric(!event.target.checked)}
            />
          }
          label="These are new leads"
          description="Set this before you choose the file. History does not create tasks or a created event."
        />
        <p className="text-sm text-muted-foreground">Phone numbers are read as {country ?? "US"}.</p>
        {role === "owner" ? (
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void setCountry({ workspaceId, country: countryCode }).catch(() =>
                setError("Use a two letter country code."),
              );
            }}
          >
            <Field label="Country code" name="country-code" help="Two letters. The workspace default is US.">
              <Input
                id="country-code"
                name="country-code"
                type="text"
                value={countryCode}
                maxLength={2}
                autoComplete="off"
                onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
              />
            </Field>
            <Button type="submit" variant="secondary">
              Save country
            </Button>
          </form>
        ) : null}
        <Field label="CSV file" name="csv-file">
          <input
            id="csv-file"
            name="csv-file"
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setError("");
              void (async () => {
                const url = await createUpload({ workspaceId });
                const response = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": file.type || "text/csv" },
                  body: file,
                });
                if (!response.ok) {
                  setError("The file did not upload.");
                  return;
                }
                const json = (await response.json()) as { storageId: Id<"_storage"> };
                const id = await start({
                  workspaceId,
                  fileStorageId: json.storageId,
                  mappingJson: JSON.stringify(mapping),
                  historic,
                  dryRun: true,
                });
                setRunId(id);
              })().catch(() => setError("The file did not upload."));
            }}
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          Expected columns: email, phone, first_name, last_name, name, source_id, activity_at.
        </p>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {run ? (
          <div className="grid gap-2 text-sm" aria-live="polite">
            <p>Status: {run.status}</p>
            <p>
              {run.dryRun ? "Would create" : "Created"} {run.createdCount}. {run.dryRun ? "Would update" : "Updated"}{" "}
              {run.updatedCount}. Skipped {run.skippedCount}. Review {run.reviewCount}.
            </p>
            <p>
              Unreadable phones {run.phoneUnreadableCount}. Rows with no email or phone {run.missingContactCount}.
              Missing activity time {run.missingActivityCount}.
            </p>
            <p>
              Similar names {run.similarNameCount}. Kept {run.similarNameKept}.
            </p>
            <ul aria-label="Row issues" className="grid gap-1">
              {run.issues.map((issue: { row: number; code: string }) => (
                <li key={`${issue.row}-${issue.code}`}>
                  Row {issue.row}, {issue.code}. {reasonPhrase(issue.code)}
                </li>
              ))}
            </ul>
            {run.dryRun ? (
              <Button
                type="button"
                disabled={run.status !== "done"}
                onClick={() => {
                  void start({
                    workspaceId,
                    fileStorageId: run.fileStorageId,
                    mappingJson: JSON.stringify(mapping),
                    historic,
                    dryRun: false,
                  }).then((id) => setRunId(id));
                }}
              >
                Run import
              </Button>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
