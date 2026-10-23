"use client";

import { useMutation } from "convex/react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../convex/_generated/api";
import { bodyText } from "@/lib/ui";

const steps = [
  { title: "Connect your tools", detail: "Email and calendar first. Nothing is connected." },
  { title: "Pick which agents to turn on", detail: "Every agent is off. Turning one on comes later." },
  { title: "Go live", detail: "No agent runs, and nothing is sent." },
];

export function DecisionsView() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return <LiveDecisions shell={shell} />;
}

function LiveDecisions({ shell }: { shell: NonNullable<ReturnType<typeof useWorkspaceShell>> }) {
  const mark = useMutation(api.workspace.markSetupDone);

  if (!shell.setupDone) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <PageHeader
          eyebrow="First sign-in"
          title="Set up the workspace"
          description="Connect your tools, choose agents, then go live. Nothing runs until you do."
        />
        <Panel className="p-6">
          <ol className="grid gap-5">
            {steps.map((step, index) => (
              <li key={step.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-medium text-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-card-foreground">{step.title}</p>
                  <p className={`${bodyText} mt-1`}>{step.detail}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Not connected</p>
                </div>
              </li>
            ))}
          </ol>
          {shell.role === "owner" ? (
            <form
              className="mt-8"
              onSubmit={(event) => {
                event.preventDefault();
                void mark({ workspaceId: shell.workspaceId, setupDone: true });
              }}
            >
              <Button type="submit">Mark setup done</Button>
            </form>
          ) : (
            <p className={`${bodyText} mt-8`}>An owner marks setup done.</p>
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <PageHeader eyebrow="Today" title="Decisions" description="Here is your day." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        <Panel className="p-6">
          <h2 className="font-heading text-base text-card-foreground">Waiting on you</h2>
          <p className={`${bodyText} mt-3`}>Nothing is waiting.</p>
          {shell.role === "owner" ? (
            <form
              className="mt-6"
              onSubmit={(event) => {
                event.preventDefault();
                void mark({ workspaceId: shell.workspaceId, setupDone: false });
              }}
            >
              <Button type="submit" variant="ghost">
                Show the setup path
              </Button>
            </form>
          ) : null}
        </Panel>
        <div className="grid gap-4">
          <Panel className="p-6">
            <h2 className="font-heading text-base text-card-foreground">Due now</h2>
            <p className={`${bodyText} mt-3`}>Nothing is due.</p>
          </Panel>
          <Panel className="p-6">
            <h2 className="font-heading text-base text-card-foreground">Work next</h2>
            <p className={`${bodyText} mt-3`}>Nothing is queued.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
