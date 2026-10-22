import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { PreviewShell } from "@/components/preview/preview-shell";
import { Badge } from "@/components/ui/badge";
import { WorkflowEditor } from "@/components/workflows/workflow-editor";
import type { EditorContext } from "@/lib/workflows/editor-context";
import { SAMPLE_PLAYBOOK, SAMPLE_WORKFLOWS } from "@/lib/workflows/samples";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SAMPLE_CONTEXT: EditorContext = {
  stages: SAMPLE_PLAYBOOK.stages,
  snippets: SAMPLE_PLAYBOOK.snippets,
  talkTracks: SAMPLE_PLAYBOOK.talkTracks,
  members: SAMPLE_PLAYBOOK.members,
  roles: SAMPLE_PLAYBOOK.roles,
  channels: ["text", "email"],
  routingAvailable: true,
  unhealthyChannels: [],
};

/**
 * Development only: the workflow editor on the proposed starting workflows,
 * against a labeled fake playbook. Never served by a production build, never
 * reads a workspace, and saves nothing.
 */
export default async function WorkflowsPreviewPage({ searchParams }: { searchParams: Promise<{ id?: string; view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { id } = await searchParams;
  const sample = SAMPLE_WORKFLOWS.find((item) => item.id === id) ?? SAMPLE_WORKFLOWS[0];

  return (
    <PreviewShell title="Workflows" crumbs={[{ label: "Workflows", href: "/preview/workflows" }, { label: sample.name, href: `/preview/workflows?id=${sample.id}` }]}>
      <PageFrame
        title={sample.name}
        description={sample.description}
        secondaryActions={<Badge variant="outline">Draft</Badge>}
      >
        <nav aria-label="Sample workflows" className="flex flex-wrap gap-2">
          {SAMPLE_WORKFLOWS.map((item) => (
            <Link
              key={item.id}
              href={`/preview/workflows?id=${item.id}`}
              aria-current={item.id === sample.id ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                item.id === sample.id ? "border-primary/50 bg-primary/10 text-card-foreground" : "text-muted-foreground hover:text-card-foreground"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <WorkflowEditor key={sample.id} initialGraph={sample.graph} ctx={SAMPLE_CONTEXT} timeZone="America/New_York" now={new Date().toISOString()} editable />
      </PageFrame>
    </PreviewShell>
  );
}
