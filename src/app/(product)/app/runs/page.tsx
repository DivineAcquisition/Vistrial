"use client";

import { usePaginatedQuery } from "convex/react";
import { useState } from "react";

import { RunList, type RunListItem } from "@/components/runs/run-list";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { asRunStatus, asStopReason, type RunStatus } from "@/lib/runs/view";
import { skillName } from "@/lib/runs/skill-name";
import { api } from "../../../../../convex/_generated/api";

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "stopped", label: "Stopped" },
];

const SINCE_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

const WHO_OPTIONS = [
  { value: "", label: "Anyone" },
  { value: "me", label: "Started by me" },
];

const DAY = 86_400_000;

function Runs({ shell }: { shell: WorkspaceShell }) {
  const [status, setStatus] = useState("");
  const [agentSlug, setAgentSlug] = useState("");
  const [skillSlug, setSkillSlug] = useState("");
  const [who, setWho] = useState("");
  const [sinceDays, setSinceDays] = useState("");
  const [since, setSince] = useState<number | undefined>(undefined);

  const { results, status: loadStatus, loadMore } = usePaginatedQuery(
    api.runs.page,
    {
      workspaceId: shell.workspaceId,
      status: status ? (status as RunStatus) : undefined,
      agentSlug: agentSlug || undefined,
      skillSlug: skillSlug || undefined,
      startedByMe: who === "me" ? true : undefined,
      since,
    },
    { initialNumItems: 20 },
  );

  const agent = shell.agents.find((row) => row.slug === agentSlug);
  const skillOptions = [
    { value: "", label: "Any skill" },
    ...(agent?.skills ?? []).map((skill) => ({ value: skill.slug, label: skill.name })),
  ];
  const filtered = Boolean(status || agentSlug || skillSlug || who || sinceDays);

  const items: RunListItem[] = results.map((row) => ({
    id: row.id,
    skillName: skillName(shell, row.agentSlug, row.skillSlug),
    agentName: shell.agents.find((a) => a.slug === row.agentSlug)?.name ?? row.agentSlug,
    status: asRunStatus(row.status),
    stopReason: asStopReason(row.stopReason),
    costCents: row.costCents,
    startedAt: row.startedAt,
    startedByMe: row.startedByMe,
  }));

  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Agents"
        title="Runs"
        description="Every run an agent made, newest first. Open one to watch it or see why it stopped."
        toolbar={
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="group" aria-label="Filter runs">
            <Select aria-label="Status" density="compact" value={status} options={STATUS_OPTIONS} onChange={(e) => setStatus(e.target.value)} />
            <Select
              aria-label="Agent"
              density="compact"
              value={agentSlug}
              options={[{ value: "", label: "Any agent" }, ...shell.agents.map((a) => ({ value: a.slug, label: a.name }))]}
              onChange={(e) => {
                setAgentSlug(e.target.value);
                setSkillSlug("");
              }}
            />
            <Select
              aria-label="Skill"
              density="compact"
              value={skillSlug}
              options={skillOptions}
              disabled={!agentSlug}
              onChange={(e) => setSkillSlug(e.target.value)}
            />
            <Select aria-label="Started by" density="compact" value={who} options={WHO_OPTIONS} onChange={(e) => setWho(e.target.value)} />
            <Select
              aria-label="When"
              density="compact"
              value={sinceDays}
              options={SINCE_OPTIONS}
              onChange={(e) => {
                setSinceDays(e.target.value);
                setSince(e.target.value ? Date.now() - Number(e.target.value) * DAY : undefined);
              }}
            />
          </div>
        }
      />
      <Panel className="p-2 sm:p-4">
        {loadStatus === "LoadingFirstPage" ? <p className="p-2 text-sm text-muted-foreground">Loading runs.</p> : null}
        {loadStatus !== "LoadingFirstPage" && items.length === 0 ? (
          <EmptyState
            bare
            kind={filtered ? "no-results" : "empty"}
            title={filtered ? "No runs match these filters." : "No runs yet."}
            detail={filtered ? undefined : "Runs show here once an owner or manager starts a skill."}
          />
        ) : null}
        <RunList runs={items} />
        {loadStatus === "CanLoadMore" ? (
          <Button type="button" variant="outline" className="mt-3" onClick={() => loadMore(20)}>
            Show more runs
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}

export default function RunsPage() {
  const shell = useWorkspaceShell();
  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  return <Runs shell={shell} />;
}
