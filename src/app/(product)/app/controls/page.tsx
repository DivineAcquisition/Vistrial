"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

type Caps = { maxCostCentsPerRun: number; maxCostCentsPerDay: number; maxSteps: number; maxDurationMs: number };

type SkillCaps = { slug: string; name: string; caps: Caps; defaults: Caps; ceiling: Caps; daySpentCents: number };

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function SkillCapsForm({ workspaceId, skill }: { workspaceId: Id<"workspaces">; skill: SkillCaps }) {
  const setCaps = useMutation(api.controls.setCaps);
  const [runCap, setRunCap] = useState(String(skill.caps.maxCostCentsPerRun));
  const [dayCap, setDayCap] = useState(String(skill.caps.maxCostCentsPerDay));
  const [message, setMessage] = useState("");
  const id = `caps-${skill.slug}`;
  return (
    <form
      className="grid gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0"
      aria-labelledby={`${id}-name`}
      onSubmit={(event) => {
        event.preventDefault();
        setMessage("");
        void setCaps({
          workspaceId,
          skillSlug: skill.slug,
          maxCostCentsPerRun: Number(runCap),
          maxCostCentsPerDay: Number(dayCap),
          maxSteps: skill.caps.maxSteps,
          maxDurationMs: skill.caps.maxDurationMs,
        })
          .then(() => setMessage("Saved."))
          .catch(() => setMessage(`That cap is above the ceiling for ${skill.name}.`));
      }}
    >
      <div className="grid gap-1">
        <h2 id={`${id}-name`} className="text-sm font-medium">
          {skill.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Default {dollars(skill.defaults.maxCostCentsPerRun)} a run and {dollars(skill.defaults.maxCostCentsPerDay)} a day.
          Ceiling {dollars(skill.ceiling.maxCostCentsPerRun)} a run and {dollars(skill.ceiling.maxCostCentsPerDay)} a day.
          Spent today {dollars(skill.daySpentCents)}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm" htmlFor={`${id}-run`}>
          Max cents per run
          <Input id={`${id}-run`} inputMode="numeric" value={runCap} onChange={(event) => setRunCap(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm" htmlFor={`${id}-day`}>
          Max cents per day
          <Input id={`${id}-day`} inputMode="numeric" value={dayCap} onChange={(event) => setDayCap(event.target.value)} />
        </label>
      </div>
      <Button type="submit" className="justify-self-start">
        Save caps for {skill.name}
      </Button>
      {message ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export default function ControlsPage() {
  const shell = useWorkspaceShell();
  const controls = useQuery(api.controls.get, shell ? { workspaceId: shell.workspaceId } : "skip");
  const setPaused = useMutation(api.controls.setPaused);
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Owner"
        title="Controls"
        description="Caps and pause apply to new runs. A paused workspace cancels runs that are still open. Each skill has its own caps."
      />
      <Panel className="grid gap-3 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {controls?.paused ? "Agents are paused." : "Agents are not paused."}{" "}
          {controls?.halted ? "The platform is halted." : "The platform is not halted."}
        </p>
        {shell.role === "owner" ? (
          <Button type="button" onClick={() => void setPaused({ workspaceId: shell.workspaceId, paused: !controls?.paused })}>
            {controls?.paused ? "Resume agents" : "Pause agents"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">An owner changes pause and caps.</p>
        )}
      </Panel>
      {shell.role === "owner" && controls ? (
        <Panel className="grid gap-4 p-4 sm:p-6">
          {controls.skills.map((skill) => (
            <SkillCapsForm key={skill.slug} workspaceId={shell.workspaceId} skill={skill} />
          ))}
        </Panel>
      ) : null}
    </div>
  );
}
