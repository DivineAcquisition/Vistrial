"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, MessagesSquare, Plus } from "@/components/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { SessionCard } from "@/components/agents/session-card";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { bodyText } from "@/lib/ui";
import { api } from "../../../../../../convex/_generated/api";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { StartSessionButton } from "@/components/sessions/start-session-button";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberTicker } from "@/components/ui/number-ticker";
import { PlannedAgent } from "@/components/agents/planned-agent";

/** The agent's overview: what it does, its latest sessions and its skills. */
export default function AgentOverview() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  const agent = shell?.agents.find((row) => row.slug === params.slug);
  const live = agent?.status === "live";
  const tree = useQuery(
    api.agentFolder.tree,
    shell && live
      ? { workspaceId: shell.workspaceId, agentSlug: params.slug, limit: 3 }
      : "skip",
  );
  const devSkill = useQuery(
    api.runs.devSkill,
    shell ? { workspaceId: shell.workspaceId } : "skip",
  );
  const start = useMutation(api.runs.start);
  const [notice, setNotice] = useState("");
  if (!shell || !agent) return null;
  const base = `/app/agents/${agent.slug}`;

  return (
    <div className="grid gap-5">
      {live && shell.role !== "rep" && agent.state !== "off" ? (
        <Button className="w-fit" render={<Link href={`${base}/sessions/new`} />}>
          <Plus aria-hidden /> New session
        </Button>
      ) : null}
      {live ? (
        <Panel className="grid gap-3 p-4 sm:p-5">
          <p className={bodyText}>{agent.promise}</p>
        </Panel>
      ) : (
        <PlannedAgent workspaceId={shell.workspaceId} slug={agent.slug} name={agent.name} job={agent.job} />
      )}

      {live && tree ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section
            className="grid content-start gap-3"
            aria-label="Latest sessions"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-heading text-base text-foreground">
                <MessagesSquare aria-hidden className="size-4 text-primary" />{" "}
                Latest sessions
              </h2>
              <Link
                href={`${base}/sessions`}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                All sessions <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </div>
            {tree.sessions.length === 0 ? (
              <EmptyState
                preview="cards"
                title="Your sessions with this agent will appear here."
                detail="A session is one piece of work: you ask, it studies, you review."
                action={shell.role !== "rep" && agent.state !== "off" ? <StartSessionButton agentSlug={agent.slug} label="Start the first session" /> : undefined}
              />
            ) : (
              <Stagger as="div" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tree.sessions.map((session) => (
                  <StaggerItem as="div" key={session.id}>
                    <SessionCard session={session} href={`${base}/sessions/${session.id}`} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </section>
          <aside className="grid content-start gap-3" aria-label="At a glance">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                {
                  label: "Facts",
                  value: tree.counts.facts,
                  href: `${base}/memory`,
                },
                {
                  label: "Reports",
                  value: tree.counts.reports,
                  href: `${base}/reports`,
                },
                {
                  label: "Running",
                  value: tree.counts.runsOpen,
                  href: `${base}/activity`,
                },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="grid rounded-xl border border-border bg-card px-2 py-2 hover:border-primary/40"
                >
                  <span className="font-heading text-lg text-card-foreground tabular-nums">
                    <NumberTicker value={item.value} className="text-card-foreground" />
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      {(agent.skills ?? []).length > 0 ? (
        <section className="grid gap-3" aria-label="Skills">
          <h2 className="font-heading text-base text-foreground">Skills</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {(agent.skills ?? []).map((skill) => (
              <li
                key={skill.slug}
                className="grid content-start gap-1 rounded-xl border border-border bg-card p-4"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-card-foreground">
                    {skill.name}
                  </span>
                  <StatusBadge
                    label={
                      skill.status === "available" ? "Available" : "Coming soon"
                    }
                    tone={skill.status === "available" ? "good" : "neutral"}
                    className="[&_span]:normal-case"
                  />
                </span>
                <span className="text-sm text-muted-foreground">
                  {skill.handsBack}
                </span>
                {skill.promise ? (
                  <span className="text-sm text-muted-foreground">
                    {skill.promise}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {devSkill &&
      agent.slug === devSkill.agentSlug &&
      shell.role !== "rep" &&
      agent.state !== "off" ? (
        <Panel className="flex flex-wrap items-center gap-3 p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void start({
                workspaceId: shell.workspaceId,
                agentSlug: agent.slug,
                skillSlug: devSkill.slug,
              }).then(
                () => setNotice("Test run started. It shows under Activity."),
                () => setNotice("The test run did not start."),
              );
            }}
          >
            Run test skill
          </Button>
          {notice ? (
            <p className="text-sm text-muted-foreground">{notice}</p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
