import "server-only";

import { leadTimeZones } from "@/lib/compliance/lead-timezone";
import { complianceRulesFrom, decideCompliance, type ComplianceDecision } from "@/lib/compliance/rules";
import { requireConfig } from "@/lib/config/server";
import type { GhlDb } from "@/lib/ghl/tokens";
import { zonedStartOfDay } from "@/lib/home/periods";

export type DispatchCompliance =
  | Exclude<ComplianceDecision, { action: "block" }>
  | { action: "block"; reason: "opted_out" }
  | { action: "block"; reason: "config_incomplete"; detail: string };

function localMidnight(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return zonedStartOfDay(timeZone, read("year"), read("month"), read("day"));
}

/**
 * The locked compliance rules, checked for one queued message just before it
 * goes out. Every message to a lead passes through here, whichever screen or
 * job queued it: follow-ups, the approval queue, and anything run without
 * approval.
 */
export async function complianceForDispatch(
  db: GhlDb,
  row: { id: string; org_id: string; lead_id: string; actor_member_id: string | null },
  now = new Date()
): Promise<DispatchCompliance> {
  const gate = await requireConfig(db, row.org_id, "dispatch");
  if (!gate.ok) return { action: "block", reason: "config_incomplete", detail: gate.reason };
  const values = gate.config.values;
  const workspaceTimeZone = String(values["identity.timezone"]);

  const { data: lead } = await db
    .from("leads")
    .select("opted_out_at, timezone, phone")
    .eq("id", row.lead_id)
    .eq("org_id", row.org_id)
    .maybeSingle();

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data: recent } = await db
    .from("ghl_dispatches")
    .select("sent_at")
    .eq("org_id", row.org_id)
    .eq("lead_id", row.lead_id)
    .eq("status", "sent")
    .neq("id", row.id)
    .gte("sent_at", weekAgo)
    .order("sent_at", { ascending: true });
  const sentTimes = (recent ?? []).flatMap((entry) => (entry.sent_at ? [new Date(entry.sent_at)] : []));
  const midnight = localMidnight(now, workspaceTimeZone).getTime();

  return decideCompliance({
    now,
    rules: complianceRulesFrom(values),
    lead: {
      optedOutAt: lead?.opted_out_at ?? null,
      zones: leadTimeZones({ timezone: lead?.timezone, phone: lead?.phone }, workspaceTimeZone).zones,
    },
    workspaceTimeZone,
    sent: {
      today: sentTimes.filter((at) => at.getTime() >= midnight).length,
      lastSevenDays: sentTimes.length,
      oldestInWeek: sentTimes[0] ?? null,
    },
    // Nobody approved it: it is running without approval.
    autoRun: row.actor_member_id === null,
  });
}
