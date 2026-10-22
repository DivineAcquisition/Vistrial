"use client";

import { AgentRail, AgentRoster, AddAgentsLink } from "@/components/agents/agent-roster";
import { AgentSummaryContext } from "@/components/agents/summary-context";
import { OrgProvider, useOrg } from "@/components/app/org-provider";
import { LibraryCard } from "@/app/(workspace)/app/agents/library/library-actions";
import { sidebarSample, type SidebarSampleState } from "@/lib/agents/samples";
import type { WorkspaceRole } from "@/lib/auth/types";

const ROLES: Array<{ role: WorkspaceRole; label: string }> = [
  { role: "owner", label: "Owner" },
  { role: "member", label: "Member" },
  { role: "operator", label: "Operator" },
  { role: "service_team", label: "Service Team" },
];

function Frame({ title, width, children }: { title: string; width: string; children: React.ReactNode }) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-xs text-muted-foreground">{title}</figcaption>
      <div className="overflow-hidden rounded-xl border border-border bg-sidebar p-2" style={{ width }}>
        {children}
      </div>
    </figure>
  );
}

/** The real roster components, fed sample summaries, one per role and width. */
export function SidebarSamples({ state }: { state: SidebarSampleState }) {
  const base = useOrg();
  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
      {ROLES.map(({ role, label }) => {
        const summary = sidebarSample(state, role, base.org.id);
        const value = {
          ...base,
          workspaceRole: role,
          isStaff: role === "service_team",
          isPlatformAdmin: false,
          role: role === "operator" ? ("setter" as const) : role === "member" ? ("member" as const) : ("owner" as const),
        };
        return (
          <OrgProvider key={role} value={value}>
            <AgentSummaryContext.Provider value={{ summary, refresh: () => undefined, reconnecting: false }}>
              <div className="space-y-4">
                <Frame title={`${label}, sidebar`} width="16rem">
                  <AgentRoster />
                  <div className="mt-2 border-t border-sidebar-border pt-2">
                    <AddAgentsLink />
                  </div>
                </Frame>
                <Frame title={`${label}, icon rail`} width="3.5rem">
                  <AgentRail />
                </Frame>
                {role === "owner" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Library cards in this state</p>
                    {summary.agents
                      .filter((row) => row.state === "locked" || row.state === "pending" || row.state === "available")
                      .map((row) => (
                        <LibraryCard key={row.id} row={row} detail={null} readOnly={false} role="owner" />
                      ))}
                  </div>
                ) : null}
              </div>
            </AgentSummaryContext.Provider>
          </OrgProvider>
        );
      })}
    </div>
  );
}
