import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listWorkflows, workflowsEnabled } from "@/lib/workflows/store";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/workflows/labels";

export const dynamic = "force-dynamic";

export const metadata = { title: "Workflows" };

export default async function WorkflowsPage() {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isStaff) notFound();
  const supabase = await createClient();
  if (!(await workflowsEnabled(supabase, ctx.org.id))) notFound();
  const workflows = await listWorkflows(supabase, ctx.org.id);

  return (
    <PageFrame title="Workflows" description="How your team follows up and moves a lead from new to won or lost.">
      {workflows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No workflows yet. When one is drawn for you it will appear here for your review. Nothing runs until you publish it.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {workflows.map((workflow) => (
            <li key={workflow.id}>
              <Link href={`/app/workflows/${workflow.id}`} className="block rounded-2xl focus-visible:outline-2">
                <Card>
                  <CardContent className="space-y-2 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-medium">{workflow.name}</h2>
                      <Badge variant={STATUS_VARIANT[workflow.status]}>{STATUS_LABEL[workflow.status]}</Badge>
                    </div>
                    {workflow.description ? <p className="text-sm text-muted-foreground">{workflow.description}</p> : null}
                    <p className="text-xs text-muted-foreground">
                      {workflow.liveCount === 1 ? "1 lead in it now" : `${workflow.liveCount} leads in it now`}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
