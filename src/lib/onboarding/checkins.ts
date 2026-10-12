import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The first-week check-in: a short checklist for staff on days 1, 3 and 7
 * after go-live, filled from what actually happened in the workspace. Counts
 * only; never what a lead wrote.
 */

export type CheckinFacts = {
  since: string;
  alerts: { total: number; acknowledged: number; open: number };
  drafts: { total: number; decided: number; waiting: number };
  failedRuns: number;
  connection: { crm: string; openIssues: number };
  requestsUnanswered: number;
  quietOperators: string[];
};

export type CheckinItem = { key: string; question: string; answer: string; ok: boolean | null };

export async function loadCheckinFacts(db: SupabaseClient, orgId: string, since: string): Promise<CheckinFacts> {
  const [alerts, drafts, failed, crm, issues, requests, operators, touches] = await Promise.all([
    db.from("sentry_alerts").select("status, acknowledged_at").eq("org_id", orgId).gte("created_at", since).limit(5000),
    db.from("approval_items").select("status").eq("org_id", orgId).gte("created_at", since).limit(5000),
    db.from("agent_activity_runs").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "failed").gte("created_at", since),
    db.from("ghl_connections").select("status").eq("org_id", orgId).maybeSingle(),
    db.from("staff_escalations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("kind", "connection").neq("status", "resolved"),
    db.from("help_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "received"),
    db.from("org_members").select("id, display_name, email, role").eq("org_id", orgId).eq("seat", "customer").eq("active", true).in("role", ["operator", "setter", "closer"]),
    db.from("touches").select("actor_member_id").eq("org_id", orgId).eq("type", "human").gte("occurred_at", since).limit(10000),
  ]);
  const alertRows = (alerts.data ?? []) as Array<{ status: string; acknowledged_at: string | null }>;
  const draftRows = (drafts.data ?? []) as Array<{ status: string }>;
  const active = new Set(((touches.data ?? []) as Array<{ actor_member_id: string | null }>).map((row) => row.actor_member_id).filter(Boolean));
  const quiet = ((operators.data ?? []) as Array<{ id: string; display_name: string | null; email: string }>)
    .filter((member) => !active.has(member.id))
    .map((member) => member.display_name?.trim() || member.email);
  return {
    since,
    alerts: {
      total: alertRows.length,
      acknowledged: alertRows.filter((row) => row.acknowledged_at || row.status === "resolved").length,
      open: alertRows.filter((row) => row.status === "open").length,
    },
    drafts: {
      total: draftRows.length,
      decided: draftRows.filter((row) => row.status !== "pending").length,
      waiting: draftRows.filter((row) => row.status === "pending").length,
    },
    failedRuns: failed.count ?? 0,
    connection: { crm: String((crm.data as { status?: string } | null)?.status ?? "none"), openIssues: issues.count ?? 0 },
    requestsUnanswered: requests.count ?? 0,
    quietOperators: quiet,
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function checkinItems(facts: CheckinFacts): CheckinItem[] {
  return [
    {
      key: "alerts",
      question: "Are alerts being acknowledged?",
      answer: facts.alerts.total === 0
        ? "No alerts yet."
        : `${facts.alerts.acknowledged} of ${plural(facts.alerts.total, "alert", "alerts")} acknowledged; ${facts.alerts.open} still open.`,
      ok: facts.alerts.total === 0 ? null : facts.alerts.open === 0 || facts.alerts.acknowledged / facts.alerts.total >= 0.5,
    },
    {
      key: "drafts",
      question: "Are drafts being approved or rejected?",
      answer: facts.drafts.total === 0
        ? "No drafts yet."
        : `${facts.drafts.decided} of ${plural(facts.drafts.total, "draft", "drafts")} decided; ${facts.drafts.waiting} waiting.`,
      ok: facts.drafts.total === 0 ? null : facts.drafts.waiting <= Math.max(2, facts.drafts.total / 2),
    },
    {
      key: "runs",
      question: "Any failed agent runs?",
      answer: facts.failedRuns === 0 ? "None." : plural(facts.failedRuns, "failed run", "failed runs") + ". Open the agent page to review.",
      ok: facts.failedRuns === 0,
    },
    {
      key: "connections",
      question: "Any connection problems?",
      answer: facts.connection.crm !== "active"
        ? `The CRM connection is ${facts.connection.crm === "none" ? "missing" : facts.connection.crm}.`
        : facts.connection.openIssues > 0
          ? plural(facts.connection.openIssues, "open connection alert", "open connection alerts") + "."
          : "Everything is connected.",
      ok: facts.connection.crm === "active" && facts.connection.openIssues === 0,
    },
    {
      key: "requests",
      question: "Any customer requests unanswered?",
      answer: facts.requestsUnanswered === 0 ? "None." : plural(facts.requestsUnanswered, "request waits", "requests wait") + " for a reply.",
      ok: facts.requestsUnanswered === 0,
    },
    {
      key: "operators",
      question: "Any Operator with no activity?",
      answer: facts.quietOperators.length === 0 ? "Everyone has logged activity." : `No activity yet from ${facts.quietOperators.slice(0, 5).join(", ")}${facts.quietOperators.length > 5 ? ", and others" : ""}.`,
      ok: facts.quietOperators.length === 0,
    },
  ];
}
