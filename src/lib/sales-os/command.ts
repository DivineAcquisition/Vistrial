import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRuns, type RunView } from "@/lib/actions/views";
import { confirmationCounts } from "@/lib/foundation/fields";
import { loadFoundation } from "@/lib/foundation/store";
import { localDay } from "@/lib/manager/eod";
import { loadEods, type EodReport } from "@/lib/manager/store";

export type CommandLead = { leadId: string; name: string; detail: string; at: string | null };

export type CommandData = {
  alerts: CommandLead[];
  hotNoNext: CommandLead[];
  stepsDue: CommandLead[];
  suggestions: RunView[];
  myEod: EodReport | null;
  teamYesterday: { confirmed: number; drafted: number } | null;
  foundation: { drafted: number; needsOwner: number; confirmed: number; total: number; version: number | null };
};

const DAY = 86_400_000;

async function leadNames(db: SupabaseClient, orgId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await db.from("leads").select("id, first_name, last_name").eq("org_id", orgId).in("id", ids);
  return new Map(
    ((data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((row) => [
      row.id,
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Unnamed lead",
    ]),
  );
}

/**
 * Read with the person's own client: row-level security limits an operator
 * to their own leads, and a rep only ever sees their own report.
 */
export async function loadCommand(db: SupabaseClient, args: { orgId: string; memberId: string; timeZone: string; leads: boolean; manager: boolean; now: number }): Promise<CommandData> {
  const soon = new Date(args.now + DAY).toISOString();
  const today = localDay(args.now, args.timeZone);
  const yesterday = localDay(args.now - DAY, args.timeZone);

  const [alerts, hot, steps, suggestions, myEods, foundation, team] = await Promise.all([
    args.leads
      ? db.from("sentry_alerts").select("lead_id, title, created_at").eq("org_id", args.orgId).eq("status", "open").order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
    args.leads
      ? db.from("lead_scores").select("lead_id, score").eq("org_id", args.orgId).eq("tier", "hot").order("score", { ascending: false }).limit(40)
      : Promise.resolve({ data: [] }),
    args.leads
      ? db.from("workflow_enrollments").select("lead_id, next_due_at").eq("org_id", args.orgId).eq("status", "active").lte("next_due_at", soon).order("next_due_at", { ascending: true }).limit(8)
      : Promise.resolve({ data: [] }),
    loadRuns(db, args.orgId, { statuses: ["suggested"], limit: 10 }),
    loadEods(db, args.orgId, { memberId: args.memberId, since: yesterday, status: "drafted" }),
    loadFoundation(db, args.orgId),
    args.manager ? loadEods(db, args.orgId, { since: yesterday }) : Promise.resolve([] as EodReport[]),
  ]);

  const alertRows = ((alerts.data ?? []) as Array<{ lead_id: string | null; title: string; created_at: string }>).filter((row) => row.lead_id);
  const hotRows = (hot.data ?? []) as Array<{ lead_id: string; score: number }>;
  const stepRows = ((steps.data ?? []) as Array<{ lead_id: string | null; next_due_at: string | null }>).filter((row) => row.lead_id);

  let hotNoNextRows = hotRows;
  if (hotRows.length) {
    const { data: open } = await db
      .from("next_actions")
      .select("lead_id")
      .eq("org_id", args.orgId)
      .is("completed_at", null)
      .in("lead_id", hotRows.map((row) => row.lead_id));
    const withNext = new Set(((open ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id));
    hotNoNextRows = hotRows.filter((row) => !withNext.has(row.lead_id)).slice(0, 8);
  }

  const names = await leadNames(db, args.orgId, [
    ...new Set([...alertRows.map((row) => row.lead_id!), ...hotNoNextRows.map((row) => row.lead_id), ...stepRows.map((row) => row.lead_id!)]),
  ]);
  const name = (id: string) => names.get(id) ?? "Unnamed lead";
  const counts = confirmationCounts(foundation);
  const yesterdays = team.filter((report) => report.day === yesterday);

  return {
    alerts: alertRows.map((row) => ({ leadId: row.lead_id!, name: name(row.lead_id!), detail: row.title, at: row.created_at })),
    hotNoNext: hotNoNextRows.map((row) => ({ leadId: row.lead_id, name: name(row.lead_id), detail: `Score ${row.score}, no next step`, at: null })),
    stepsDue: stepRows.map((row) => ({ leadId: row.lead_id!, name: name(row.lead_id!), detail: "Playbook step due", at: row.next_due_at })),
    suggestions,
    myEod: myEods.find((report) => report.day === today) ?? myEods[0] ?? null,
    teamYesterday: args.manager ? { confirmed: yesterdays.filter((report) => report.status === "confirmed").length, drafted: yesterdays.filter((report) => report.status === "drafted").length } : null,
    foundation: { ...counts, version: foundation.version?.version ?? null },
  };
}
