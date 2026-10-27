"use client";

import { useMutation, useQuery } from "convex/react";

import { ProfileEditor } from "@/components/profile/profile-editor";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { bodyText } from "@/lib/ui";

export function DecisionsView() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return <LiveDecisions shell={shell} />;
}

function LiveDecisions({ shell }: { shell: NonNullable<ReturnType<typeof useWorkspaceShell>> }) {
  const profile = useQuery(api.profile.get, { workspaceId: shell.workspaceId });
  const waiting = useQuery(api.assets.list, {
    workspaceId: shell.workspaceId,
    status: "draft",
    paginationOpts: { numItems: 20, cursor: null },
  });
  const turnOn = useMutation(api.workspace.setAgentState);
  const finish = useMutation(api.profile.finishSetup);
  const approve = useMutation(api.assets.approve);
  const mark = useMutation(api.workspace.markSetupDone);
  const salesOn = shell.agents.find((agent) => agent.slug === "sales")?.state !== "off";

  if (profile === undefined || waiting === undefined) {
    return <p className="text-sm text-muted-foreground">Loading the queue.</p>;
  }

  if (!shell.setupDone) {
    return (
      <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
        <PageHeader
          eyebrow="First sign-in"
          title="Set up the workspace"
          description="Confirm the business profile, then turn on the Sales Agent. Nothing runs until you do."
        />
        <ol className="grid gap-2 text-sm">
          <li>{profile.confirmed ? "Profile: done." : "Profile: not done."}</li>
          <li>{salesOn ? "Sales Agent: done." : "Sales Agent: not done."}</li>
        </ol>
        <ProfileEditor workspaceId={shell.workspaceId} role={shell.role} />
        <Panel className="grid gap-3 p-4 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">Sales Agent</h2>
          <p className={bodyText}>{salesOn ? "The Sales Agent is on. It still cannot post." : "The Sales Agent is off."}</p>
          {shell.role === "owner" ? (
            <Button type="button" variant="secondary" onClick={() => void turnOn({ workspaceId: shell.workspaceId, slug: "sales", state: "on" })}>
              Turn on the Sales Agent
            </Button>
          ) : (
            <p className={bodyText}>An owner turns the Sales Agent on.</p>
          )}
          {shell.role === "owner" ? (
            <Button type="button" onClick={() => void finish({ workspaceId: shell.workspaceId })}>
              Finish setup
            </Button>
          ) : null}
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Today"
        title="Decisions"
        description="Assets wait here until a person approves them. Nothing is posted on its own."
      />
      <Panel className="p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Waiting on you</h2>
        {waiting.page.length === 0 ? <p className={`${bodyText} mt-3`}>Nothing is waiting.</p> : null}
        <ul className="mt-4 grid gap-4">
          {waiting.page.map((asset: { id: Id<"assets">; title: string; kind: string }) => (
            <li key={asset.id} className="grid gap-2 rounded-xl border border-border p-4">
              <p className="font-medium text-card-foreground">{asset.title}</p>
              <p className="text-sm text-muted-foreground">{asset.kind}</p>
              {shell.role === "rep" ? null : (
                <Button type="button" onClick={() => void approve({ workspaceId: shell.workspaceId, assetId: asset.id })}>
                  Approve
                </Button>
              )}
            </li>
          ))}
        </ul>
        {shell.role === "owner" ? (
          <Button className="mt-6" type="button" variant="ghost" onClick={() => void mark({ workspaceId: shell.workspaceId, setupDone: false })}>
            Show the setup path
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}
