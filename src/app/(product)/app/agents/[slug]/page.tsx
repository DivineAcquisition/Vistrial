"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, MessagesSquare, Plug } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { SessionCard } from "@/components/agents/session-card";
import { MetaLogo } from "@/components/connections/meta-logo";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { bodyText } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { api } from "../../../../../../convex/_generated/api";

const CONNECTION_TONE: Record<string, { label: string; tone: "good" | "warning" | "neutral" }> = {
  on: { label: "On", tone: "good" },
  attention: { label: "Needs attention", tone: "warning" },
  notGranted: { label: "Not granted", tone: "neutral" },
  off: { label: "Off", tone: "neutral" },
};

/** The agent's overview: what it does, its latest sessions, what it is connected to, and its skills. */
export default function AgentOverview() {
  const params = useParams<{ slug: string }>();
  const shell = useWorkspaceShell();
  const agent = shell?.agents.find((row) => row.slug === params.slug);
  const live = agent?.status === "live";
  const tree = useQuery(api.agentFolder.tree, shell && live ? { workspaceId: shell.workspaceId, agentSlug: params.slug, limit: 3 } : "skip");
  const devSkill = useQuery(api.runs.devSkill, shell ? { workspaceId: shell.workspaceId } : "skip");
  const start = useMutation(api.runs.start);
  const [notice, setNotice] = useState("");
  if (!shell || !agent) return null;
  const base = `/app/agents/${agent.slug}`;

  return (
    <div className="grid gap-5">
      <Panel className="grid gap-3 p-4 sm:p-5">
        <p className={bodyText}>{agent.promise}</p>
        {!live ? <p className={bodyText}>Planned. This agent is part of the workforce but does not run yet, so it cannot be turned on.</p> : null}
      </Panel>

      {live && tree ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="grid content-start gap-3" aria-label="Latest sessions">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-heading text-base text-foreground">
                <MessagesSquare aria-hidden className="size-4 text-primary" /> Latest sessions
              </h2>
              <Link href={`${base}/sessions`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                All sessions <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </div>
            {tree.sessions.length === 0 ? (
              <Panel className="grid gap-3 p-5">
                <p className="text-sm text-muted-foreground">No sessions yet. A session is one piece of work: you ask, it studies, you review.</p>
                {shell.role !== "rep" && agent.state !== "off" ? (
                  <Button className="w-fit" render={<Link href={`${base}/sessions/new`} />}>
                    Start the first session
                  </Button>
                ) : null}
              </Panel>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tree.sessions.map((session) => (
                  <SessionCard key={session.id} session={session} href={`${base}/sessions/${session.id}`} />
                ))}
              </div>
            )}
          </section>
          <aside className="grid content-start gap-3" aria-label="Connections">
            <h2 className="flex items-center gap-2 font-heading text-base text-foreground">
              <Plug aria-hidden className="size-4 text-primary" /> Connected to
            </h2>
            <Panel className="grid gap-1 p-2">
              {tree.connections.map((row) => {
                const tone = CONNECTION_TONE[row.state];
                return (
                  <Link
                    key={row.key}
                    href={row.key === "meta" || row.key === "results" ? `${base}/connections/${row.key}` : `${base}/connections#${row.key}`}
                    className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-accent"
                  >
                    {row.key === "meta" ? <MetaLogo className="h-3.5 w-5 shrink-0" /> : <span aria-hidden className={cn("ml-1.5 size-2 shrink-0 rounded-full", row.state === "on" ? "bg-success" : row.state === "attention" ? "bg-warning" : "bg-muted-foreground/40")} />}
                    <span className="min-w-0 flex-1 truncate text-card-foreground">{row.label}</span>
                    <StatusBadge label={tone.label} tone={tone.tone} className="shrink-0 [&_span]:normal-case" />
                  </Link>
                );
              })}
            </Panel>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Facts", value: tree.counts.facts, href: `${base}/memory` },
                { label: "Reports", value: tree.counts.reports, href: `${base}/reports` },
                { label: "Running", value: tree.counts.runsOpen, href: `${base}/activity` },
              ].map((item) => (
                <Link key={item.label} href={item.href} className="grid rounded-xl border border-border bg-card px-2 py-2 hover:border-primary/40">
                  <span className="font-heading text-lg text-card-foreground tabular-nums">{item.value}</span>
                  <span className="text-[11px] text-muted-foreground">{item.label}</span>
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
              <li key={skill.slug} className="grid content-start gap-1 rounded-xl border border-border bg-card p-4">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-card-foreground">{skill.name}</span>
                  <StatusBadge label={skill.status === "available" ? "Available" : "Coming soon"} tone={skill.status === "available" ? "good" : "neutral"} className="[&_span]:normal-case" />
                </span>
                <span className="text-sm text-muted-foreground">{skill.handsBack}</span>
                {skill.promise ? <span className="text-sm text-muted-foreground">{skill.promise}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {devSkill && agent.slug === devSkill.agentSlug && shell.role !== "rep" && agent.state !== "off" ? (
        <Panel className="flex flex-wrap items-center gap-3 p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void start({ workspaceId: shell.workspaceId, agentSlug: agent.slug, skillSlug: devSkill.slug }).then(
                () => setNotice("Test run started. It shows under Activity."),
                () => setNotice("The test run did not start."),
              );
            }}
          >
            Run test skill
          </Button>
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
