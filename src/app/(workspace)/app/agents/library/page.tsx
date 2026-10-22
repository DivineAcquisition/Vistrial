import { notFound } from "next/navigation";

import { LibraryCard, NotifyAreaButton } from "@/app/(workspace)/app/agents/library/library-actions";
import { PageFrame } from "@/components/app/page-frame";
import { OnboardCard } from "@/components/ui/onboard-card";
import { Panel } from "@/components/ui/panel";
import { loadAgentSummary } from "@/lib/agents/summary-load";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Add agents" };

export type LibraryDetail = {
  longDescription: string;
  autonomy: { automatic: string[]; suggests: string[]; never: string[] };
  worksOn: string[];
  prerequisites: string[];
};

/**
 * The Agent Library: every agent this workspace can see, by area, with its
 * status here and one action. Owners and the Vistrial team act on it;
 * Members read it; Operators never see it.
 */
export default async function AgentLibraryPage() {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole === "operator") notFound();
  const [summary, details] = await Promise.all([loadAgentSummary(ctx.org.id), loadDetails()]);
  if (!summary) notFound();
  const readOnly = ctx.workspaceRole === "member";

  const across = summary.agents.filter((agent) => agent.area === null);
  const sections = summary.areas.map((area) => ({ area, agents: summary.agents.filter((agent) => agent.area === area.id) }));

  return (
    <PageFrame
      title={readOnly ? "Agents in this workspace" : "Add agents"}
      description={
        readOnly
          ? "What each agent does here. Ask your Owner to turn on agents."
          : "Turn agents on, see what each one needs, and ask about the ones not on your plan yet. Turning an agent on never changes your billing."
      }
    >
      <div className="space-y-8">
        <Panel className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-card-foreground">How an agent comes on</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Finish what it needs, confirm it, then it is ready. Turning an agent on never changes your billing.
            </p>
          </div>
          <OnboardCard step1="Included on your plan" step2="Finish setup" step3="Ready to turn on" />
        </Panel>
        {across.length ? (
          <section aria-labelledby="library-across" className="space-y-3">
            <h2 id="library-across" className="text-sm font-medium text-card-foreground">
              Across areas
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {across.map((agent) => (
                <LibraryCard key={agent.id} row={agent} detail={details[agent.id] ?? null} readOnly={readOnly} role={ctx.workspaceRole} />
              ))}
            </div>
          </section>
        ) : null}
        {sections.map(({ area, agents }) => (
          <section key={area.id} aria-labelledby={`library-${area.id}`} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 id={`library-${area.id}`} className="text-sm font-medium text-card-foreground">
                {area.name}
              </h2>
              {area.availability === "coming_soon" ? <span className="text-xs text-muted-foreground">Coming soon</span> : null}
            </div>
            <p className="text-sm text-muted-foreground">{area.description}</p>
            {agents.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {agents.map((agent) => (
                  <LibraryCard key={agent.id} row={agent} detail={details[agent.id] ?? null} readOnly={readOnly} role={ctx.workspaceRole} />
                ))}
              </div>
            ) : (
              <Panel className="flex flex-col items-center gap-4 p-4 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">No agents here yet. We will let you know when the first one is ready.</p>
                  {readOnly ? null : (
                    <div className="mt-3">
                      <NotifyAreaButton areaId={area.id} done={area.interest.includes("notify_me")} />
                    </div>
                  )}
                </div>
                <OnboardCard step1="Area planned" step2="First agent in review" step3="Ready to turn on" />
              </Panel>
            )}
          </section>
        ))}
      </div>
    </PageFrame>
  );
}

async function loadDetails(): Promise<Record<string, LibraryDetail>> {
  const db = await createClient();
  const { data } = await (db as unknown as {
    from: (t: string) => { select: (c: string) => Promise<{ data: Array<Record<string, unknown>> | null }> };
  })
    .from("agent_registry")
    .select("id, long_description, autonomy, works_on, prerequisites");
  const out: Record<string, LibraryDetail> = {};
  for (const row of data ?? []) {
    out[String(row.id)] = {
      longDescription: String(row.long_description ?? ""),
      autonomy: (row.autonomy as LibraryDetail["autonomy"]) ?? { automatic: [], suggests: [], never: [] },
      worksOn: (row.works_on as string[]) ?? [],
      prerequisites: (row.prerequisites as string[]) ?? [],
    };
  }
  return out;
}
