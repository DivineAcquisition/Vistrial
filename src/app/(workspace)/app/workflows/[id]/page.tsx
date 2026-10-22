import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { OutlineView } from "@/components/workflows/outline-view";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { checkWorkflow } from "@/lib/workflows/checker";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/workflows/labels";
import { toOutline } from "@/lib/workflows/outline";
import { loadCheckContext, loadWorkflow, workflowsEnabled } from "@/lib/workflows/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Workflow" };

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isStaff) notFound();
  const supabase = await createClient();
  if (!(await workflowsEnabled(supabase, ctx.org.id))) notFound();
  const workflow = await loadWorkflow(supabase, ctx.org.id, id);
  if (!workflow) notFound();

  const result = checkWorkflow(workflow.graph, await loadCheckContext(supabase, ctx.org.id));
  const problems = result.issues.filter((issue) => issue.severity === "error");
  const notices = result.issues.filter((issue) => issue.severity === "warning");
  const titleOf = (boxId: string | null) =>
    boxId ? toOutline(workflow.graph).find((row) => row.boxId === boxId)?.title : undefined;

  return (
    <PageFrame
      title={workflow.name}
      description={workflow.description || "A step by step plan for following up with a lead."}
      breadcrumbs={[{ label: "Workflows", href: "/app/workflows" }, { label: workflow.name, href: `/app/workflows/${workflow.id}` }]}
      secondaryActions={<Badge variant={STATUS_VARIANT[workflow.status]}>{STATUS_LABEL[workflow.status]}</Badge>}
    >
      <p className="text-sm text-muted-foreground">
        {workflow.version ? `Version ${workflow.version}. ` : ""}
        {workflow.draftedBy === "compass" ? "Drafted by Compass. " : ""}
        Nothing runs until you publish it. Every message waits for your approval.
      </p>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="text-base font-medium">Steps</h2>
          <OutlineView items={toOutline(workflow.graph)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="text-base font-medium">Checks before it can be published</h2>
          {problems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No problems found.</p>
          ) : (
            <ul className="space-y-2" aria-label="Problems to fix">
              {problems.map((issue, index) => (
                <li key={index} className="text-sm">
                  <Badge size="sm" variant="error">
                    Fix
                  </Badge>{" "}
                  {titleOf(issue.boxId) ? <span className="font-medium">{titleOf(issue.boxId)}: </span> : null}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          {notices.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground" aria-label="Things to know">
              {[...new Map(notices.map((issue) => [issue.message, issue])).values()].map((issue) => (
                <li key={issue.message}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Link href="/app/workflows" className="text-sm font-medium text-brand-300 hover:underline">
        Back to all workflows
      </Link>
    </PageFrame>
  );
}
