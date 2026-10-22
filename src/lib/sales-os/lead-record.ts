import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CONNECTORS } from "@/lib/connectors/catalog";
import { loadOrgCaseFile } from "@/lib/cases/load";
import type { CaseFilePayload, CaseTimelineEntry } from "@/lib/cases/types";
import { describeBox } from "@/lib/workflows/describe";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { nowSummary, type NowChange, type NowSummary } from "@/lib/sales-os/now";
import { createClient } from "@/lib/supabase/server";

export type LeadAlert = {
  id: string;
  kind: "nudge" | "escalation";
  level: number;
  status: string;
  title: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
};

export type LeadPlaybook = {
  enrollmentId: string;
  playbookId: string;
  playbook: string;
  status: string;
  step: string;
  stepSummary: string;
  nextDueAt: string | null;
  enteredAt: string;
};

export type LeadConnectedApp = { key: string; label: string; externalId: string; lastSyncAt: string | null };

export type LeadTeamMember = { name: string; role: string; lastAt: string | null };

export type LeadRecord = {
  payload: CaseFilePayload;
  now: NowSummary;
  alerts: LeadAlert[];
  playbooks: LeadPlaybook[];
  approvals: Array<{ id: string; title: string; createdAt: string; status: string }>;
  apps: LeadConnectedApp[];
  team: LeadTeamMember[];
  tier: { tier: string; score: number; historic: boolean } | null;
};

const CONNECTOR_LABEL = new Map(CONNECTORS.map((connector) => [connector.key, connector.name]));

function entryLabel(entry: CaseTimelineEntry): string {
  switch (entry.kind) {
    case "touch":
      return `${entry.channel} ${entry.direction}${entry.outcome ? `, ${entry.outcome.replaceAll("_", " ")}` : ""}`;
    case "call":
      return `${entry.callType} call${entry.outcome ? `, ${entry.outcome.replaceAll("_", " ")}` : ""}`;
    case "status":
      return `Stage moved to ${entry.toStatus.replaceAll("_", " ")}`;
    case "activity":
      return entry.headline;
  }
}

/**
 * Everything the Lead Record shows, read under the person's own session so
 * row-level security (including the operator lead scope) decides what loads.
 */
export async function loadLeadRecord(leadId: string, viewer: { orgId: string; userId: string }): Promise<LeadRecord | null> {
  const payload = await loadOrgCaseFile(leadId);
  if (!payload || payload.lead.orgId !== viewer.orgId) return null;
  const db = (await createClient()) as unknown as SupabaseClient;
  const orgId = viewer.orgId;

  const [alerts, enrollments, approvals, identities, connections, score, seen] = await Promise.all([
    db
      .from("sentry_alerts")
      .select("id, kind, level, status, title, created_at, acknowledged_at, acknowledged_by, resolved_at")
      .eq("org_id", orgId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("workflow_enrollments")
      .select("id, playbook_id, version_id, current_box_id, status, next_due_at, entered_at")
      .eq("org_id", orgId)
      .eq("lead_id", leadId)
      .neq("status", "ended")
      .limit(5),
    db
      .from("approval_items")
      .select("id, title, created_at, status")
      .eq("org_id", orgId)
      .contains("lead_ids", [leadId])
      .in("status", ["pending", "running", "failed"])
      .order("created_at", { ascending: true })
      .limit(20),
    db.from("lead_identities").select("kind, value, source, first_seen_at").eq("org_id", orgId).eq("lead_id", leadId).eq("kind", "crm"),
    db.from("workspace_connections").select("connector_key, last_update_at, status").eq("org_id", orgId).neq("status", "disconnected"),
    db.from("lead_scores").select("tier, score, historic").eq("org_id", orgId).eq("lead_id", leadId).maybeSingle(),
    db.from("lead_record_views").select("seen_at").eq("user_id", viewer.userId).eq("lead_id", leadId).maybeSingle(),
  ]);

  await db
    .from("lead_record_views")
    .upsert({ user_id: viewer.userId, lead_id: leadId, org_id: orgId, seen_at: new Date().toISOString() }, { onConflict: "user_id,lead_id" });

  const alertRows: LeadAlert[] = ((alerts.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    kind: row.kind === "escalation" ? "escalation" : "nudge",
    level: Number(row.level ?? 0),
    status: String(row.status),
    title: String(row.title),
    createdAt: String(row.created_at),
    acknowledgedAt: (row.acknowledged_at as string | null) ?? null,
    acknowledgedBy: (row.acknowledged_by as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
  }));

  const enrollmentRows = (enrollments.data ?? []) as Array<Record<string, unknown>>;
  const [books, versions] = enrollmentRows.length
    ? await Promise.all([
        db.from("playbooks").select("id, name").eq("org_id", orgId).in("id", enrollmentRows.map((row) => String(row.playbook_id))),
        db.from("playbook_versions").select("id, graph").eq("org_id", orgId).in("id", enrollmentRows.map((row) => String(row.version_id))),
      ])
    : [{ data: [] }, { data: [] }];
  const bookName = new Map(((books.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
  const graphs = new Map(((versions.data ?? []) as Array<{ id: string; graph: WorkflowGraph }>).map((row) => [row.id, row.graph]));
  const playbooks: LeadPlaybook[] = enrollmentRows.map((row) => {
    const box = graphs.get(String(row.version_id))?.boxes?.find((candidate) => candidate.id === row.current_box_id);
    const described = box ? describeBox(box) : { title: "Step", summary: "" };
    return {
      enrollmentId: String(row.id),
      playbookId: String(row.playbook_id),
      playbook: bookName.get(String(row.playbook_id)) ?? "Playbook",
      status: String(row.status),
      step: described.title,
      stepSummary: described.summary,
      nextDueAt: (row.next_due_at as string | null) ?? null,
      enteredAt: String(row.entered_at),
    };
  });

  const lastSync = new Map(
    ((connections.data ?? []) as Array<{ connector_key: string; last_update_at: string | null }>).map((row) => [row.connector_key, row.last_update_at])
  );
  const apps: LeadConnectedApp[] = ((identities.data ?? []) as Array<{ value: string }>).flatMap((row) => {
    const split = row.value.indexOf(":");
    if (split <= 0) return [];
    const key = row.value.slice(0, split);
    return [{ key, label: CONNECTOR_LABEL.get(key) ?? key, externalId: row.value.slice(split + 1), lastSyncAt: lastSync.get(key) ?? null }];
  });

  const entries = payload.timeline.entries;
  const touchers = new Map<string, LeadTeamMember>();
  const lead = payload.lead;
  if (lead.assignedSetterName) touchers.set(lead.assignedSetterName, { name: lead.assignedSetterName, role: "Setter", lastAt: null });
  if (lead.assignedCloserName) touchers.set(lead.assignedCloserName, { name: lead.assignedCloserName, role: "Closer", lastAt: null });
  for (const entry of entries) {
    if (!entry.actorName) continue;
    const known = touchers.get(entry.actorName);
    if (!known) touchers.set(entry.actorName, { name: entry.actorName, role: "Touched this lead", lastAt: entry.at });
    else if (!known.lastAt || Date.parse(entry.at) > Date.parse(known.lastAt)) known.lastAt = entry.at;
  }

  const open = payload.nextActions.filter((action) => !action.completedAt);
  const next = open.sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))[0] ?? null;
  const lastTouch = entries.find((entry) => entry.kind === "touch" || entry.kind === "call") ?? null;
  const changes: NowChange[] = [
    ...entries.map((entry) => ({ at: entry.at, label: entryLabel(entry) })),
    ...alertRows.map((alert) => ({ at: alert.createdAt, label: `Alert: ${alert.title}` })),
  ];
  const nowMs = Date.now();
  const firstPlaybook = playbooks[0] ?? null;

  return {
    payload,
    alerts: alertRows,
    playbooks,
    approvals: ((approvals.data ?? []) as Array<{ id: string; title: string; created_at: string; status: string }>).map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      status: row.status,
    })),
    apps,
    team: [...touchers.values()],
    tier: score.data ? { tier: String(score.data.tier), score: Number(score.data.score), historic: score.data.historic === true } : null,
    now: nowSummary({
      stage: lead.pipelineStage ?? lead.status,
      lastTouch: lastTouch ? { at: lastTouch.at, label: entryLabel(lastTouch) } : null,
      nextStep: next ? { text: next.actionText, dueAt: next.dueAt } : null,
      ownerName: lead.assignedCloserName ?? lead.assignedSetterName,
      overdueSteps: open.filter((action) => action.overdue).length,
      openAlerts: alertRows.filter((alert) => alert.status === "open").length,
      playbookStep: firstPlaybook ? { playbook: firstPlaybook.playbook, step: firstPlaybook.step, dueAt: firstPlaybook.nextDueAt } : null,
      waitingApprovals: (approvals.data ?? []).length,
      seenAt: (seen.data as { seen_at?: string } | null)?.seen_at ?? null,
      changes,
      now: nowMs,
    }),
  };
}
