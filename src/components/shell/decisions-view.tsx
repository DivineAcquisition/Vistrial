"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";

import { GROWTH_ARCHITECT } from "../../../convex/catalog";
import { VistrialMark } from "@/components/brand/vistrial-mark";
import { LoopHome } from "@/components/home/loop-home";
import { Plus } from "@/components/icons";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../convex/_generated/api";
import { bodyText } from "@/lib/ui";

export function DecisionsView() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return <LiveDecisions shell={shell} />;
}

function LiveDecisions({ shell }: { shell: NonNullable<ReturnType<typeof useWorkspaceShell>> }) {
  const profile = useQuery(api.profile.get, { workspaceId: shell.workspaceId });
  const turnOn = useMutation(api.workspace.setAgentState);
  const finish = useMutation(api.profile.finishSetup);
  const architectState = shell.agents.find((agent) => agent.slug === GROWTH_ARCHITECT)?.state ?? "off";
  const architectOn = architectState !== "off";

  // Once setup is done, home is the loop. The first sign-in keeps its setup path below.
  if (shell.setupDone) return <LoopHome />;

  if (profile === undefined) {
    return <p className="text-sm text-muted-foreground">Loading the queue.</p>;
  }

  return (
    <div className="grid gap-8">
      <section className="flex flex-wrap items-center justify-between gap-4" aria-label="Start a session">
        <div className="flex items-center gap-3">
          <VistrialMark size="md" />
          <div>
            <h1 className="font-heading text-xl text-foreground">What should Vistrial work on?</h1>
            <p className="text-sm text-muted-foreground">Start a session and ask in your own words. It begins from what it knows about your business.</p>
          </div>
        </div>
        <Button render={<Link href="/app/agents/growth-architect/work/chat" />}>
          <Plus aria-hidden /> New session
        </Button>
      </section>
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
          <p className={bodyText}>{architectOn ? "Growth Architect is on. It still cannot publish anything." : "Growth Architect is off."}</p>
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
    </div>
  );
}
