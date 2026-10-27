"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../../../convex/_generated/api";

export default function ControlsPage() {
  const shell = useWorkspaceShell();
  const controls = useQuery(api.controls.get, shell ? { workspaceId: shell.workspaceId, agentSlug: "sales" } : "skip");
  const setCaps = useMutation(api.controls.setCaps);
  const setPaused = useMutation(api.controls.setPaused);
  const [runCap, setRunCap] = useState("25");
  const [dayCap, setDayCap] = useState("200");
  const [error, setError] = useState("");
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Owner"
        title="Controls"
        description="Caps and pause apply to new runs. A paused workspace cancels runs that are still open."
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
        {shell.role === "owner" ? (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              void setCaps({
                workspaceId: shell.workspaceId,
                agentSlug: "sales",
                maxCostCentsPerRun: Number(runCap),
                maxCostCentsPerDay: Number(dayCap),
                maxSteps: 40,
                maxDurationMs: 300000,
              }).catch(() => setError("That cap is above the platform ceiling."));
            }}
          >
            <label className="grid gap-2 text-sm" htmlFor="run-cap">
              Max cents per run
              <Input id="run-cap" inputMode="numeric" value={runCap} onChange={(event) => setRunCap(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm" htmlFor="day-cap">
              Max cents per day
              <Input id="day-cap" inputMode="numeric" value={dayCap} onChange={(event) => setDayCap(event.target.value)} />
            </label>
            <Button type="submit">Save caps</Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </form>
        ) : null}
      </Panel>
    </div>
  );
}
