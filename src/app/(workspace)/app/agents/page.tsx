import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { AgentsOverview } from "@/components/live/agent-pages";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agents" };

export default async function AgentsPage() {
  const ctx = await getAuthContext();
  return (
    <PageFrame
      title="Agents"
      description="Who is working for this workspace right now, and what each one may and may not do."
      secondaryActions={
        ctx.isStaff ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/app/agents/health" className="font-medium text-brand-300 hover:underline">
              Health across workspaces
            </Link>
            {ctx.isPlatformAdmin ? (
              <Link href="/app/agents/simulator" className="font-medium text-brand-300 hover:underline">
                Simulator
              </Link>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <AgentsOverview />
    </PageFrame>
  );
}
