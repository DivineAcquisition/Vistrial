"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";

import { GROWTH_ARCHITECT } from "../../../convex/catalog";
import { AssetRow, type AssetRowView } from "@/components/assets/asset-row";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "../../../convex/_generated/api";
import { bodyText } from "@/lib/ui";
import { StartSessionButton } from "@/components/sessions/start-session-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { CheckInsDue } from "@/components/research/outcome-loop";

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
  const review = useQuery(api.assets.list, {
    workspaceId: shell.workspaceId,
    status: "needsReview",
    paginationOpts: { numItems: 20, cursor: null },
  });
  const questions = useQuery(api.studio.attention, { workspaceId: shell.workspaceId });
  const turnOn = useMutation(api.workspace.setAgentState);
  const finish = useMutation(api.profile.finishSetup);
  const mark = useMutation(api.workspace.markSetupDone);
  const architectState = shell.agents.find((agent) => agent.slug === GROWTH_ARCHITECT)?.state ?? "off";
  const architectOn = architectState !== "off";

  if (profile === undefined || waiting === undefined) {
    return <p className="text-sm text-muted-foreground">Loading the queue.</p>;
  }

  if (!shell.setupDone) {
    return (
      <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
        <PageHeader
          eyebrow="First sign-in"
          title="Set up the workspace"
          description="Confirm the business profile, then turn on Growth Architect. Nothing runs until you do."
        />
        <ol className="grid gap-2 text-sm">
          <li>{profile.confirmed ? "Profile: done." : "Profile: not done."}</li>
          <li>{architectOn ? "Growth Architect: done." : "Growth Architect: not done."}</li>
        </ol>
        <ProfileEditor workspaceId={shell.workspaceId} role={shell.role} />
        <Panel className="grid gap-3 p-4 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">Growth Architect</h2>
          <p className={bodyText}>
            {architectOn ? "Growth Architect is on. It still cannot publish anything." : "Growth Architect is off."}
          </p>
          {shell.role === "owner" ? (
            <Button type="button" variant="secondary" onClick={() => void turnOn({ workspaceId: shell.workspaceId, slug: GROWTH_ARCHITECT, state: "on" })}>
              Turn on Growth Architect
            </Button>
          ) : (
            <p className={bodyText}>An owner turns Growth Architect on.</p>
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
      {questions && questions.length > 0 ? (
        <Panel className="grid gap-3 p-4 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">Questions for you</h2>
          <p className="text-sm text-muted-foreground">Research stopped to ask instead of guessing. Nothing runs or spends until you answer.</p>
          <Stagger className="grid gap-3">
            {questions.map((row) => (
              <StaggerItem key={row.runId} className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={row.status === "needsInput" ? "Needs Input — Timed Out" : "Waiting for User"}
                      tone={row.status === "needsInput" ? "critical" : "warning"}
                      className="[&_span]:normal-case"
                    />
                    <span className="text-xs text-muted-foreground">{row.projectTitle}</span>
                  </div>
                  <p className="font-medium break-words text-card-foreground">{row.question}</p>
                </div>
                <Button size="sm" render={<Link href={`/app/agents/growth-architect/sessions/${row.projectId}`} />}>
                  {row.status === "needsInput" ? "Resume" : "Answer"}
                </Button>
              </StaggerItem>
            ))}
          </Stagger>
        </Panel>
      ) : null}
      <CheckInsDue />
      {review && review.page.length > 0 ? (
        <Panel className="grid gap-3 p-4 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">Needs review</h2>
          <p className="text-sm text-muted-foreground">These drafts did not pass every check. Edit one to add a new version, or reject it with a reason.</p>
          <Stagger className="grid gap-3">
            {review.page.map((asset: AssetRowView) => (
              <StaggerItem key={asset.id}>
                <AssetRow asset={asset} />
              </StaggerItem>
            ))}
          </Stagger>
        </Panel>
      ) : null}
      {waiting.page.length === 0 && !(questions && questions.length) && !(review && review.page.length) ? (
        <EmptyState
          preview="rows"
          title="Decisions waiting on you will appear here."
          detail="Reports wait for your approval and questions wait for your answer. Nothing is posted or spent on its own."
          action={shell.role !== "rep" ? <StartSessionButton /> : undefined}
        />
      ) : (
      <Panel className="p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Waiting on you</h2>
        {waiting.page.length === 0 ? <p className={`${bodyText} mt-3`}>Nothing else is waiting.</p> : null}
        <Stagger className="mt-4 grid gap-3">
          {waiting.page.map((asset: AssetRowView) => (
            <StaggerItem key={asset.id}>
              <AssetRow asset={asset} />
            </StaggerItem>
          ))}
        </Stagger>
        {waiting.page.length > 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {shell.role === "rep" ? "An owner or manager approves these." : "Open one to read its claims and sources, then approve it."}
          </p>
        ) : null}
        {shell.role === "owner" ? (
          <Button className="mt-6" type="button" variant="ghost" onClick={() => void mark({ workspaceId: shell.workspaceId, setupDone: false })}>
            Show the setup path
          </Button>
        ) : null}
      </Panel>
      )}
    </div>
  );
}
