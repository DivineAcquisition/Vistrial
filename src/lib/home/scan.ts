import "server-only";

import { createHash } from "node:crypto";

import type { GhlDb } from "@/lib/ghl/tokens";
import { AREA_PRODUCERS } from "@/lib/home/areas/producers";
import type { NewQueueItem, ProducerOrg } from "@/lib/home/areas/producer-types";
import { actionType, HOME_AREAS, queueKind, type ApprovalMode } from "@/lib/home/catalog";
import { loadGateState, type GateState } from "@/lib/home/gate";
import { runApprovalItem } from "@/lib/home/run";
import { loadOrgNotifyContext } from "@/lib/notifications/members";
import { notificationHref } from "@/lib/notifications/messages";
import { offerToMember } from "@/lib/notifications/offer";
import type { Json } from "@/types/database";
import { AUTOMATION_STATUSES } from "@/lib/workspaces/status";

export type ScanResult = {
  orgs: number;
  created: number;
  autoRun: number;
  escalated: number;
  dismissed: number;
  errors: number;
};

function dedupeKey(item: NewQueueItem): string {
  const leads = item.drafts.map((draft) => draft.leadId).sort().join(",");
  return `${item.kind}:${createHash("sha1").update(leads).digest("hex")}`;
}

/** Whether an item of this action type may run without a person right now. */
export function mayAutoRun(org: ProducerOrg, gate: GateState, actionTypeId: string): boolean {
  if (gate.choice(actionTypeId).mode !== "auto_run") return false;
  if (org.halted) return false;
  const definition = actionType(actionTypeId);
  // Messages and CRM changes leave through the CRM; a CRM stop holds them.
  if (org.crmHalted && (definition?.reachesPeople ?? true)) return false;
  return true;
}

async function insertItem(db: GhlDb, orgId: string, area: string, item: NewQueueItem) {
  const { data, error } = await db
    .from("approval_items")
    .insert({
      org_id: orgId,
      area,
      kind: item.kind,
      action_type: item.actionType,
      status: "pending",
      urgency: queueKind(item.kind)?.urgency ?? 50,
      title: item.title,
      preview: item.preview,
      reason: item.reason,
      lead_ids: item.drafts.map((draft) => draft.leadId),
      assigned_member_id: item.assignedMemberId,
      drafts: item.drafts as unknown as Json,
      dedupe_key: dedupeKey(item),
    })
    .select("id")
    .maybeSingle();
  if (error) {
    // Same leads already queued by a concurrent run.
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return data?.id ?? null;
}

/**
 * Makes the queue agree with the workspace's current settings: items whose
 * action type was turned off are dismissed, and items whose type now runs on
 * its own leave the queue and run, unless they waited long enough to be
 * escalated, which only an owner can release.
 */
export async function applyGateToOpenItems(
  db: GhlDb,
  org: ProducerOrg,
  gate: GateState,
  onlyActionType?: string
): Promise<{ autoRun: number; dismissed: number }> {
  let query = db
    .from("approval_items")
    .select("id, action_type")
    .eq("org_id", org.id)
    .eq("status", "pending")
    .is("escalated_at", null);
  if (onlyActionType) query = query.eq("action_type", onlyActionType);
  const { data } = await query;
  let autoRun = 0;
  let dismissed = 0;
  for (const item of data ?? []) {
    const mode: ApprovalMode = gate.choice(item.action_type).mode;
    if (mode === "off") {
      const { error } = await db
        .from("approval_items")
        .update({ status: "dismissed", dismiss_reason: "Turned off in approval settings.", decided_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "pending");
      if (!error) dismissed += 1;
    } else if (mayAutoRun(org, gate, item.action_type)) {
      const outcome = await runApprovalItem(db, {
        orgId: org.id,
        itemId: item.id,
        runMode: "auto_run",
        actor: null,
        timeZone: org.timezone,
      });
      if (outcome.ok) autoRun += 1;
    }
  }
  return { autoRun, dismissed };
}

async function escalate(db: GhlDb, org: ProducerOrg, gate: GateState, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - gate.limits.queueWaitLimitMinutes * 60_000).toISOString();
  const { data: waiting } = await db
    .from("approval_items")
    .update({ escalated_at: now.toISOString() })
    .eq("org_id", org.id)
    .eq("status", "pending")
    .is("escalated_at", null)
    .lte("created_at", cutoff)
    .select("id, lead_ids");
  if (!waiting?.length) return 0;

  // Escalated items never send on their own; they wait for an owner. Whether
  // the owner is also told depends on the escalation setting.
  if (!mayAutoRun(org, gate, "owner_escalation")) return waiting.length;
  const context = await loadOrgNotifyContext(db, org.id);
  const owners = (context?.members ?? []).filter((member) => member.role === "owner");
  for (const owner of owners) {
    await offerToMember(db, {
      target: owner,
      now,
      isEscalationToAdmin: true,
      input: {
        orgId: org.id,
        eventType: "pending_draft",
        channel: "push",
        subjectKind: "approval_item",
        subjectIds: waiting.map((item) => item.id),
        title:
          waiting.length === 1
            ? "Something has waited too long for approval"
            : `${waiting.length} items have waited too long for approval`,
        body: "Nothing sends until you decide. Open Vistrial to approve or dismiss.",
        href: notificationHref("/app/home"),
        dedupeKey: `approval_escalation:${owner.userId}:${waiting.map((item) => item.id).sort().join(",")}`,
      },
    });
  }
  await db.from("agent_events").insert({
    org_id: org.id,
    actor: "vistrial",
    action_taken: "owner_escalation",
    occurred_at: now.toISOString(),
    input: { itemIds: waiting.map((item) => item.id) } as Json,
    output: {
      runMode: "auto_run",
      approvedByMemberId: null,
      approvedByName: null,
      count: waiting.length,
      leadIds: [...new Set(waiting.flatMap((item) => item.lead_ids ?? []))],
    } as Json,
  });
  return waiting.length;
}

export async function scanOrg(db: GhlDb, org: ProducerOrg, now = new Date()): Promise<Omit<ScanResult, "orgs" | "errors">> {
  const gate = await loadGateState(db, org.id);
  const result = { created: 0, autoRun: 0, escalated: 0, dismissed: 0 };

  if (!org.halted) {
    for (const area of HOME_AREAS) {
      const producer = AREA_PRODUCERS[area.id];
      if (!producer) continue;
      const items = await producer({ db, org, gate, now });
      for (const item of items) {
        const mode = gate.choice(item.actionType).mode;
        if (mode === "off") continue;
        const autoRun = mayAutoRun(org, gate, item.actionType);
        const id = await insertItem(db, org.id, area.id, item);
        if (!id) continue;
        result.created += 1;
        if (autoRun) {
          const outcome = await runApprovalItem(db, {
            orgId: org.id,
            itemId: id,
            runMode: "auto_run",
            actor: null,
            timeZone: org.timezone,
            now,
          });
          if (outcome.ok) result.autoRun += 1;
        }
      }
    }
  }

  const swept = await applyGateToOpenItems(db, org, gate);
  result.autoRun += swept.autoRun;
  result.dismissed += swept.dismissed;
  result.escalated = await escalate(db, org, gate, now);
  return result;
}

export async function scanAllOrgs(db: GhlDb, now = new Date()): Promise<ScanResult> {
  const { data: orgs } = await db
    .from("organizations")
    .select("id, name, timezone, agents_halted, agent_crm_writes_halted")
    .is("offboarded_at", null)
    .in("status", AUTOMATION_STATUSES);
  const total: ScanResult = { orgs: 0, created: 0, autoRun: 0, escalated: 0, dismissed: 0, errors: 0 };
  for (const row of orgs ?? []) {
    total.orgs += 1;
    try {
      const result = await scanOrg(
        db,
        {
          id: row.id,
          name: row.name,
          timezone: row.timezone,
          halted: row.agents_halted,
          crmHalted: row.agent_crm_writes_halted,
        },
        now
      );
      total.created += result.created;
      total.autoRun += result.autoRun;
      total.escalated += result.escalated;
      total.dismissed += result.dismissed;
    } catch (error) {
      total.errors += 1;
      console.error("[vistrial] home-agents org failed", row.id, error instanceof Error ? error.message : error);
    }
  }
  return total;
}
