import Link from "next/link";

import { TaskButtons, TaskQuickAdd } from "@/app/(workspace)/app/tasks/task-form";
import { PageFrame } from "@/components/app/page-frame";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "Tasks" };

type TaskRow = {
  id: string;
  action_text: string;
  status: string;
  due_at: string | null;
  source_sentence: string | null;
  task_type: string;
  lead_id: string | null;
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await getAuthContext();
  const tab = (await searchParams).tab ?? "mine";
  const db = (await createClient()) as unknown as SupabaseClient;
  let query = db
    .from("next_actions")
    .select("id, action_text, status, due_at, source_sentence, task_type, lead_id, owner_member_id")
    .eq("org_id", ctx.org.id)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(50);
  if (tab === "done") query = query.eq("status", "done");
  else if (tab === "team" && (ctx.workspaceRole === "owner" || ctx.isStaff)) query = query.in("status", ["open", "snoozed", "suggested"]);
  else query = query.eq("owner_member_id", ctx.member.id).in("status", ["open", "snoozed", "suggested"]);
  const { data } = await query;
  const rows = (data ?? []) as TaskRow[];
  const team = ctx.workspaceRole === "owner" || ctx.isStaff;

  return (
    <PageFrame title="Tasks" description="What needs doing. Completing a task does not log a touch.">
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Tab href="/app/tasks?tab=mine" current={tab === "mine"} label="Mine" />
        {team ? <Tab href="/app/tasks?tab=team" current={tab === "team"} label="Team" /> : null}
        <Tab href="/app/tasks?tab=done" current={tab === "done"} label="Completed" />
      </div>
      <TaskQuickAdd />
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing in this list.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-medium">{row.action_text}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.status}
                    {row.due_at ? ` · due ${new Date(row.due_at).toLocaleString()}` : ""}
                  </p>
                  {row.source_sentence ? <p className="mt-1 text-sm text-muted-foreground">{row.source_sentence}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.lead_id ? (
                    <Link className="rounded-md border border-border px-3 py-2 text-sm" href={`/app/cases/${row.lead_id}`}>
                      Open lead
                    </Link>
                  ) : null}
                  {row.status !== "done" ? <TaskButtons id={row.id} /> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}

function Tab({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link href={href} className={current ? "rounded-full bg-foreground px-3 py-1 text-background" : "rounded-full border border-border px-3 py-1"}>
      {label}
    </Link>
  );
}

