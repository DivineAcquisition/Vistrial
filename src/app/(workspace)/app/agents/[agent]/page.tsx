import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { AgentDetail } from "@/components/live/agent-pages";
import { ScribeReprocess } from "@/components/live/scribe-reprocess";
import { AGENTS, isLiveAgentId } from "@/lib/agents/roster";
import { getAuthContext } from "@/lib/auth/session";
import { loadAgentPage } from "@/lib/live/load";
import { RUN_STATUS_LABEL, type RunStatus } from "@/lib/live/model";

export const dynamic = "force-dynamic";

function dateParam(value: string | undefined, endOfDay = false): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString();
}

export async function generateMetadata({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  return { title: isLiveAgentId(agent) ? AGENTS[agent].name : "Agent" };
}

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ agent: string }>;
  searchParams: Promise<{ result?: string; from?: string; to?: string }>;
}) {
  const [{ agent }, query, ctx] = await Promise.all([params, searchParams, getAuthContext()]);
  if (!isLiveAgentId(agent)) notFound();
  const result = query.result && query.result in RUN_STATUS_LABEL ? (query.result as RunStatus) : null;
  const data = await loadAgentPage(ctx.org.id, agent, {
    result,
    from: dateParam(query.from),
    to: dateParam(query.to, true),
  });
  const identity = AGENTS[agent];
  const canPause = ctx.isStaff || ctx.workspaceRole === "owner";

  return (
    <PageFrame
      title={identity.name}
      description={identity.role}
      breadcrumbs={[
        { href: "/app/agents", label: "Agents" },
        { href: `/app/agents/${agent}`, label: identity.name },
      ]}
    >
      <AgentDetail
        agentId={agent}
        current={data.current}
        history={data.history}
        stats={data.stats}
        control={data.control}
        canPause={canPause}
        showConfig={ctx.isStaff}
        filter={{ result, from: query.from ?? "", to: query.to ?? "" }}
      />
      {agent === "scribe" && canPause ? <ScribeReprocess /> : null}
    </PageFrame>
  );
}
