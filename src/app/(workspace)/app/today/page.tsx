import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { getAuthContext } from "@/lib/auth/session";
import { loadExperiencePage } from "@/lib/cases/experience-load";
import { EMPTY_EXPERIENCE_FILTER, RESPONSE_LABEL } from "@/lib/cases/experience";
import { StatusBadge } from "@/components/ui/status-badge";
import { AgentRequestCard } from "@/components/live/request-card";
import { loadAgentRequests } from "@/lib/home/views";
import { createClient } from "@/lib/supabase/server";
import { TaskButtons } from "@/app/(workspace)/app/tasks/task-form";
import { ClaimLeadButton } from "@/app/(workspace)/app/today/claim";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const ctx = await getAuthContext();
  const mine = ctx.workspaceRole === "operator" ? "me" : null;
  const [attention, waiting, requests] = await Promise.all([
    loadExperiencePage({ ...EMPTY_EXPERIENCE_FILTER, view: "needs_attention", assignee: mine }),
    loadExperiencePage({ ...EMPTY_EXPERIENCE_FILTER, view: "waiting", assignee: mine }),
    loadAgentRequests(ctx),
  ]);
  const messages = requests.filter((item) => item.agentId === "relay");
  const rows = [...attention.rows, ...waiting.rows.filter((row) => !attention.rows.some((existing) => existing.id === row.id))].slice(0, 30);
  const operator = ctx.workspaceRole === "operator";
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: taskRows } = await db
    .from("next_actions")
    .select("id, action_text, status, due_at, source_sentence, lead_id")
    .eq("org_id", ctx.org.id)
    .eq("owner_member_id", ctx.member.id)
    .in("status", ["open", "snoozed", "suggested"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(12);
  const tasks = (taskRows ?? []) as Array<{
    id: string;
    action_text: string;
    status: string;
    due_at: string | null;
    source_sentence: string | null;
    lead_id: string | null;
  }>;
  const { data: unassigned } = operator
    ? await db
        .from("leads")
        .select("id, first_name, last_name")
        .eq("org_id", ctx.org.id)
        .is("assigned_setter_id", null)
        .is("assigned_closer_id", null)
        .eq("is_test", false)
        .limit(5)
    : { data: [] };

  return (
    <PageFrame
      title={operator ? "My day" : "Today"}
      description="What needs attention now, then tasks, then leads you can claim."
    >
      <p className="text-sm">
        <Link href="/app/tasks" className="underline">All tasks</Link>
      </p>
      {tasks.length ? (
        <section className="mb-6 space-y-3" aria-labelledby="my-tasks">
          <h2 id="my-tasks" className="text-sm font-semibold">Tasks due and overdue</h2>
          <ul className="space-y-3">
            {tasks.map((task) => {
              const overdue = task.due_at ? Date.parse(task.due_at) < Date.now() && task.status !== "snoozed" : false;
              return (
                <li key={task.id} className="rounded-lg border border-border p-4">
                  <p className="text-base font-medium">{task.action_text}</p>
                  <p className="text-sm text-muted-foreground">
                    {task.status === "suggested" ? "Suggested" : overdue ? "Overdue" : "Open"}
                    {task.source_sentence ? ` · ${task.source_sentence}` : ""}
                  </p>
                  <div className="mt-3">
                    <TaskButtons id={task.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {operator && (unassigned ?? []).length ? (
        <section className="mb-6 space-y-3" aria-labelledby="unassigned-leads">
          <h2 id="unassigned-leads" className="text-sm font-semibold">New leads you can claim</h2>
          <ul className="space-y-3">
            {(unassigned as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
                <Link href={`/app/cases/${lead.id}`} className="text-base font-medium">
                  {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead"}
                </Link>
                <ClaimLeadButton leadId={lead.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {messages.length ? (
        <section aria-labelledby="today-messages" className="mb-6 space-y-3">
          <h2 id="today-messages" className="text-sm font-semibold">Messages to send from your CRM</h2>
          {messages.map((item) => (
            <AgentRequestCard key={item.id} item={item} />
          ))}
        </section>
      ) : null}
      {rows.length === 0 && tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting. New work shows up here as it becomes due.</p>
      ) : rows.length === 0 ? null : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/app/cases/${row.id}`} className="text-base font-medium hover:underline">{row.name}</Link>
                  <p className="text-sm text-muted-foreground">{row.nextStep ?? row.headline ?? "Open the case file"}</p>
                  <div className="mt-2">
                    <StatusBadge label={row.clockLabel ?? RESPONSE_LABEL[row.responseState]} tone={row.responseState === "missed" ? "critical" : row.responseState === "at_risk" ? "warning" : "neutral"} />
                  </div>
                  {row.clockReason ? <p className="mt-1 text-xs text-muted-foreground">Sentry: {row.clockReason}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.phone ? <a className="rounded-md border border-border px-3 py-2 text-sm" href={`tel:${row.phone}`}>Call</a> : null}
                  <Link className="rounded-md border border-border px-3 py-2 text-sm" href={`/app/cases/${row.id}`}>Open</Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-muted-foreground">A daily summary to confirm will live here later. It is not built yet.</p>
    </PageFrame>
  );
}
