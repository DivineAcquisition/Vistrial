import Link from "next/link";
import { notFound } from "next/navigation";

import { enableWorkflows, requestDraw } from "@/app/(workspace)/app/workflows/actions";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { planAllowsWorkflows, workflowPowers } from "@/lib/workflows/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Card = { id: string; name: string; description: string; status: string; updated_at: string };

export default async function WorkflowsPage() {
  const ctx = await getAuthContext();
  const powers = workflowPowers(ctx.workspaceRole, false);
  if (!powers.view && !powers.manageFlag) notFound();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: manager } = await db.from("workflow_managers").select("member_id").eq("org_id", ctx.org.id).eq("member_id", ctx.member.id).maybeSingle();
  const access = workflowPowers(ctx.workspaceRole, Boolean(manager));
  const { data: plan } = await db.from("billing_accounts").select("plan_id").eq("org_id", ctx.org.id).maybeSingle();
  const allowed = planAllowsWorkflows((plan as { plan_id?: string } | null)?.plan_id ?? null);
  const { data: flag } = await db.from("workspace_flags").select("enabled").eq("org_id", ctx.org.id).eq("flag", "workflows").maybeSingle();
  const on = Boolean((flag as { enabled?: boolean } | null)?.enabled);
  const { data } = on ? await db.from("playbooks").select("id, name, description, status, updated_at").eq("org_id", ctx.org.id).order("priority").limit(20) : { data: [] };
  const cards = (data ?? []) as Card[];

  return (
    <PageFrame
      title="Workflows"
      eyebrow="Sales"
      description="The picture of how this business follows up. Agents can draw it. You approve it before anything runs."
    >
      {!allowed ? <p className="text-sm text-muted-foreground">Workflows are not included on this plan.</p> : null}
      {allowed && !on ? (
          <form action={enableWorkflows} className="space-y-2">
          <p className="text-sm">Workflows are switched off for this workspace. Nothing here runs, and the older follow-up sequences stay as they are.</p>
          {access.manageFlag ? <Button type="submit">Switch Workflows on</Button> : <p className="text-sm text-muted-foreground">The Vistrial team can switch this on.</p>}
        </form>
      ) : null}
      {on ? (
        <div className="space-y-4">
          {access.edit ? (
            <form action={requestDraw}>
              <Button type="submit" variant="secondary">Draw my process</Button>
            </form>
          ) : null}
          <ul className="grid gap-3 md:grid-cols-2">
            {cards.map((card) => (
              <li key={card.id}>
                <Link href={`/app/workflows/${card.id}`} className="block rounded-xl border border-border bg-card p-4 hover:border-brand-400">
                  <p className="font-medium text-card-foreground">{card.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.description}</p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">{label(card.status)}</p>
                </Link>
              </li>
            ))}
          </ul>
          {cards.length === 0 ? <p className="text-sm text-muted-foreground">No workflows yet. Draw the process to start from the industry defaults.</p> : null}
        </div>
      ) : null}
    </PageFrame>
  );
}

function label(status: string): string {
  switch (status) {
    case "proposed":
      return "Proposed by Compass";
    case "pending_confirmation":
      return "Pending confirmation";
    case "published":
      return "Published";
    case "paused":
      return "Paused";
    case "archived":
      return "Archived";
    default:
      return "Draft";
  }
}
