"use client";

import { useMutation, useQuery } from "convex/react";
import { Building2, ShieldCheck } from "@/components/icons";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Switch } from "@/components/ui/switch";
import { errorWords } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Who may use the workspace's Meta connection. The connection belongs to the workspace; each agent is
 * granted use of it by an Owner.
 */
export function AgentAccess({ workspaceId, agentSlug }: { workspaceId: Id<"workspaces">; agentSlug?: string }) {
  const shell = useWorkspaceShell();
  const status = useQuery(api.metaAds.status, { workspaceId });
  const setAccess = useMutation(api.metaAds.setAgentAccess);
  const [notice, setNotice] = useState("");
  if (!status?.connection || !shell) return null;
  const granted = new Set(status.connection.agents);
  const live = shell.agents.filter((agent) => agent.status === "live");
  const here = shell.agents.find((agent) => agent.slug === agentSlug);
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Building2 aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          This connection belongs to the workspace. Choose which agents may use it; an agent that is not granted never reads it.
          {agentSlug && here ? ` ${here.name} is ${granted.has(agentSlug) ? "granted" : "not granted"}.` : ""}
        </span>
      </p>
      <ul className="grid gap-2">
        {live.map((agent) => (
          <li key={agent.slug} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-card-foreground">
              <ShieldCheck aria-hidden className="size-4 text-muted-foreground" /> {agent.name}
            </span>
            <Switch
              aria-label={`Let ${agent.name} use Meta ads`}
              checked={granted.has(agent.slug)}
              disabled={!status.canManage}
              onCheckedChange={(checked: boolean) =>
                void setAccess({ workspaceId, agentSlug: agent.slug, granted: checked }).then(
                  () => setNotice(checked ? `${agent.name} may use Meta ads.` : `${agent.name} no longer uses Meta ads.`),
                  (problem: unknown) => setNotice(errorWords(problem, "That did not save.")),
                )
              }
            />
          </li>
        ))}
      </ul>
      {!status.canManage ? <p className="text-xs text-muted-foreground">Only an Owner changes who may use it.</p> : null}
      {notice ? <p role="status" className="text-xs text-muted-foreground">{notice}</p> : null}
    </div>
  );
}
