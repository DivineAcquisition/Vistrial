import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { RunViewer } from "@/components/live/run-viewer";
import { AGENTS } from "@/lib/agents/roster";
import { getAuthContext } from "@/lib/auth/session";
import { loadRunDetail } from "@/lib/live/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agent run" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [ctx, detail] = await Promise.all([getAuthContext(), loadRunDetail(id)]);
  if (!detail || detail.run.orgId !== ctx.org.id) notFound();
  const agent = AGENTS[detail.run.agentId];

  return (
    <PageFrame
      title={`${agent.name} run`}
      breadcrumbs={[
        { href: "/app/agents", label: "Agents" },
        { href: `/app/agents/${agent.id}`, label: agent.name },
        { href: `/app/runs/${id}`, label: "Run" },
      ]}
    >
      <div className="mx-auto w-full max-w-3xl">
        <RunViewer runId={id} initial={detail} staff={ctx.isStaff} />
      </div>
    </PageFrame>
  );
}
