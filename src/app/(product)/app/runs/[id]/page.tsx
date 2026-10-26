"use client";

import { useAction, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const shell = useWorkspaceShell();
  const runId = params.id as Id<"agentRuns">;
  const run = useQuery(api.runs.get, shell ? { workspaceId: shell.workspaceId, runId } : "skip");
  const advance = useAction(api.runs.advance);
  const [notice, setNotice] = useState("");
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  if (run === undefined) return <p className="text-sm text-muted-foreground">Loading the run.</p>;
  const open = run.status === "queued" || run.status === "running";
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Run"
        title={run.skillSlug}
        description="Status, steps, cost, and why the run stopped."
        status={run.status}
      />
      <Panel className="grid gap-3 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Status {run.status}
          {run.stopReason ? `. Stopped: ${run.stopReason}.` : "."} Cost {run.costCents} cents.
        </p>
        {open ? (
          <Button
            type="button"
            onClick={() => {
              void advance({ workspaceId: shell.workspaceId, runId }).then(
                (status) => setNotice(`Status ${status}.`),
                () => setNotice("The run did not advance."),
              );
            }}
          >
            Advance
          </Button>
        ) : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        <h2 className="font-heading text-base text-card-foreground">Steps</h2>
        <ol className="grid gap-2">
          {run.steps.map((step: { id: string; index: number; kind: string; toolSlug: string | null; modelRoute: string | null; resultCode: string }) => (
            <li key={step.id} className="text-sm text-muted-foreground">
              {step.index + 1}. {step.kind}
              {step.toolSlug ? ` ${step.toolSlug}` : ""}
              {step.modelRoute ? ` ${step.modelRoute}` : ""}. {step.resultCode}.
            </li>
          ))}
        </ol>
        <h2 className="font-heading text-base text-card-foreground">Artifacts</h2>
        <ul className="grid gap-2">
          {run.artifacts.map((row: { id: string; kind: string; byteSize: number; body: string }) => (
            <li key={row.id} className="text-sm text-muted-foreground">
              {row.kind}, {row.byteSize} bytes.
              {row.body ? <pre className="mt-1 whitespace-pre-wrap font-sans">{row.body}</pre> : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
