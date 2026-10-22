import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { Badge } from "@/components/ui/badge";
import { WorkflowEditor } from "@/components/workflows/workflow-editor";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/workflows/labels";
import { loadEditorContext, loadWorkflow, workflowsEnabled } from "@/lib/workflows/store";

import { saveWorkflowDraft } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Workflow" };

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isStaff) notFound();
  const supabase = await createClient();
  if (!(await workflowsEnabled(supabase, ctx.org.id))) notFound();
  const [workflow, editorContext] = await Promise.all([loadWorkflow(supabase, ctx.org.id, id), loadEditorContext(supabase, ctx.org.id)]);
  if (!workflow) notFound();
  const editingOpen = workflow.versionStatus !== "pending_confirmation";

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
        Changes save as a draft. Nothing runs until you publish it, and every message waits for your approval.
      </p>

      <WorkflowEditor
        initialGraph={workflow.graph}
        ctx={editorContext}
        timeZone={ctx.org.timezone || "America/New_York"}
        now={new Date().toISOString()}
        editable={editingOpen}
        onSave={editingOpen ? saveWorkflowDraft.bind(null, workflow.id) : undefined}
      />

      <Link href="/app/workflows" className="text-sm font-medium text-brand-300 hover:underline">
        Back to all workflows
      </Link>
    </PageFrame>
  );
}
