import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkflowEditor } from "@/components/workflows/editor";
import { PageFrame } from "@/components/app/page-frame";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { workflowPowers } from "@/lib/workflows/access";
import { countBoxes, nowMs } from "@/lib/workflows/counts";
import type { PlaybookDocument } from "@/lib/workflows/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (ctx.workspaceRole === "operator") notFound();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: manager } = await db.from("workflow_managers").select("member_id").eq("org_id", ctx.org.id).eq("member_id", ctx.member.id).maybeSingle();
  const powers = workflowPowers(ctx.workspaceRole, Boolean(manager));
  if (!powers.view) notFound();
  const { data } = await db.from("playbooks").select("id, name, description, status, graph, snippets, publish_note, version").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!data) notFound();
  const row = data as { id: string; name: string; description: string; status: string; graph: PlaybookDocument["graph"]; snippets: PlaybookDocument["snippets"]; publish_note: string | null; version: number };
  const { data: previous } = await db.from("playbook_versions").select("graph, snippets, version, note").eq("playbook_id", id).lt("version", row.version).order("version", { ascending: false }).limit(1).maybeSingle();
  const { data: enrollments } = await db.from("playbook_enrollments").select("box_id, status, step_entered_at, end_reason").eq("playbook_id", id).limit(500);
  const now = nowMs();
  const counts = countBoxes(
    ((enrollments ?? []) as Array<{ box_id: string; status: "active" | "paused" | "needs_attention" | "finished"; step_entered_at: string; end_reason: string | null }>).map((item) => ({
      boxId: item.box_id,
      status: item.status,
      edgeLabel: item.status === "finished" ? item.end_reason : null,
      ageHours: Math.max(0, (now - Date.parse(item.step_entered_at)) / 3_600_000),
      expectedHours: 48,
      endReason: item.end_reason,
    })),
  );
  const liveCounts = Object.fromEntries([...counts.entries()].map(([boxId, count]) => [boxId, { now: count.now, stalled: count.stalled, shareLabel: count.shareLabel }]));
  const compare = previous
    ? { graph: (previous as { graph: PlaybookDocument["graph"] }).graph, snippets: ((previous as { snippets?: PlaybookDocument["snippets"] }).snippets ?? []) }
    : null;

  return (
    <PageFrame title={row.name} eyebrow="Workflows" description={row.description} breadcrumbs={[{ href: "/app/workflows", label: "Workflows" }, { href: "", label: row.name }]}>
      <p className="text-sm text-muted-foreground">
        <Link href="/app/workflows" className="text-brand-300">All workflows</Link>
        {". "}List and picture show the same steps. {row.status === "proposed" ? "Drafted by Compass. Nothing runs until you publish." : null}
      </p>
      <WorkflowEditor
        id={row.id}
        name={row.name}
        status={row.status}
        document={{ graph: row.graph, snippets: row.snippets ?? [] }}
        canEdit={powers.edit && row.status !== "published" && row.status !== "archived"}
        canPublish={powers.publish}
        canPropose={powers.proposePublish}
        canConfirm={powers.confirm}
        canEnroll={powers.enrollExisting}
        liveCounts={liveCounts}
        versionNote={row.publish_note}
        compare={compare}
      />
    </PageFrame>
  );
}
