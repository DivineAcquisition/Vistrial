import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { GhlDb } from "@/lib/ghl/tokens";
import { buildOrgExport, exportJson } from "@/lib/ops/export";
import { deleteOrganizationData } from "@/lib/ops/lifecycle";
import { emailStaff, queuePortalNotice, sendPortalMail } from "@/lib/portal/notices";
import { EXPORT_BUCKET } from "@/lib/portal/export";
import { computeHealth, parseHealthRules } from "@/lib/staff/health";
import type { ConnectionRow, Health, RosterFacts } from "@/lib/staff/types";

type HealthRow = { org_id: string; level: string; changed_at: string };

function storedLevel(health: Health): Health["level"] {
  const factors = health.factors.filter((factor) => factor.key !== "payment_failed");
  if (factors.some((factor) => factor.level === "needs_attention")) return "needs_attention";
  if (factors.some((factor) => factor.level === "watch")) return "watch";
  if (health.level === "onboarding") return "onboarding";
  return "healthy";
}

async function refreshHealth(db: SupabaseClient, facts: RosterFacts[], version: number, rules: ReturnType<typeof parseHealthRules>) {
  const { data: existing } = await db.from("workspace_health_state").select("org_id, level, changed_at");
  const prior = new Map(((existing ?? []) as HealthRow[]).map((row) => [row.org_id, row]));
  const now = new Date().toISOString();
  let changed = 0;
  for (const row of facts) {
    const level = storedLevel(computeHealth(row, rules));
    const previous = prior.get(row.org_id);
    const moved = !previous || previous.level !== level;
    if (moved) changed += 1;
    await db.from("workspace_health_state").upsert({
      org_id: row.org_id,
      level,
      previous_level: previous?.level ?? null,
      factors: computeHealth(row, rules).factors.filter((factor) => factor.key !== "payment_failed"),
      rules_version: version,
      changed_at: moved ? now : previous?.changed_at ?? now,
      computed_at: now,
    });
  }
  return changed;
}

async function raiseConnections(db: SupabaseClient, rows: ConnectionRow[]) {
  const failing = rows.filter((row) => row.state === "failing" || row.state === "expired");
  const byOrg = new Map<string, ConnectionRow[]>();
  for (const row of failing) {
    const list = byOrg.get(row.org_id) ?? [];
    list.push(row);
    byOrg.set(row.org_id, list);
  }
  const day = new Date().toISOString().slice(0, 10);
  let raised = 0;
  for (const [orgId, list] of byOrg) {
    if (list[0]?.org_status === "paused" || list[0]?.org_status === "closed") continue;
    const title = list.length === 1 ? `${list[0]!.label} is ${list[0]!.state === "expired" ? "expired" : "failing"}` : `${list.length} connections are failing`;
    const { data } = await db.rpc("staff_escalation_raise", {
      p_org_id: orgId,
      p_kind: "connection",
      p_dedupe_key: `connection:${day}`,
      p_title: title,
      p_rule: list.map((row) => row.last_error).find(Boolean) ?? "A connection stopped working.",
      p_lead_id: null,
      p_source_table: "connections",
      p_source_id: orgId,
      p_notified: [],
      p_next_step: "Open Connections, fix the sign-in, and tell the Owner what changed.",
      p_affected: list.length,
    });
    if (data) {
      raised += 1;
      await emailStaff({
        orgId,
        subject: `${list[0]?.org_name ?? "A workspace"}: ${title}`,
        lines: [title, ...list.map((row) => `${row.label}: ${row.last_error ?? row.state}`), "Paused and closed workspaces are not included."],
        href: "/app/team/connections",
        ctaLabel: "Open connections",
        idempotencyKey: `connection-alert:${orgId}:${day}`,
      });
    }
  }
  return raised;
}

async function notifyFlagged(db: SupabaseClient) {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: flagged } = await db
    .from("help_requests")
    .select("id, org_id")
    .eq("status", "received")
    .gte("flagged_at", since);
  for (const row of (flagged ?? []) as Array<{ id: string; org_id: string }>) {
    await emailStaff({
      orgId: row.org_id,
      subject: "A customer request passed the reply target",
      lines: ["A question has been waiting longer than the business-hours target.", "Open the queue and reply, or say who is working on it."],
      href: `/app/team/requests/${row.id}`,
      ctaLabel: "Open the request",
      idempotencyKey: `help-flagged:${row.id}`,
    });
  }
  const { data: escalated } = await db
    .from("help_requests")
    .select("id, org_id")
    .eq("status", "received")
    .gte("escalated_at", since);
  const { data: admins } = await db.from("platform_staff").select("email").eq("active", true).eq("role", "platform_admin");
  const to = ((admins ?? []) as Array<{ email: string | null }>).map((row) => row.email).filter((email): email is string => Boolean(email));
  if (!to[0]) return { flagged: (flagged ?? []).length, escalated: (escalated ?? []).length };
  for (const row of (escalated ?? []) as Array<{ id: string; org_id: string }>) {
    await sendPortalMail({
      to,
      subject: "A customer request needs a Platform Admin",
      lines: ["A question has been waiting a business day without a reply.", "It is now with the Platform Admins."],
      cta: { label: "Open the request", href: `/app/team/requests/${row.id}` },
      idempotencyKey: `help-escalated:${row.id}`,
      category: "I",
      footer: { recipientEmail: to[0], workspaceName: "Vistrial" },
    });
  }
  return { flagged: (flagged ?? []).length, escalated: (escalated ?? []).length };
}

async function runDataRequests(db: SupabaseClient) {
  const now = new Date().toISOString();
  const { data: settings } = await db.from("staff_support_settings").select("export_link_days").eq("id", true).maybeSingle();
  const linkDays = Number((settings as { export_link_days?: number } | null)?.export_link_days ?? 7);

  const { data: deletions } = await db
    .from("data_requests")
    .select("id, org_id, org_name, requested_by_email, requested_by_user_id")
    .eq("kind", "deletion")
    .eq("status", "approved")
    .lte("scheduled_for", now);
  let deleted = 0;
  for (const request of (deletions ?? []) as Array<{ id: string; org_id: string; org_name: string; requested_by_email: string | null; requested_by_user_id: string | null }>) {
    const { data: block } = await db.rpc("data_request_billing_block", { p_org_id: request.org_id });
    if (typeof block === "string" && block) {
      await db.from("data_requests").update({ failure: block.slice(0, 300), updated_at: now }).eq("id", request.id);
      continue;
    }
    const { data: billing } = await db.from("workspace_billing").select("*").eq("org_id", request.org_id).maybeSingle();
    await db.from("retained_billing_records").insert({
      org_id: request.org_id,
      org_name: request.org_name,
      data_request_id: request.id,
      billing: billing ?? {},
    });
    try {
      await deleteOrganizationData(db as unknown as GhlDb, {
        orgId: request.org_id,
        confirmationName: request.org_name,
        reason: "Owner deletion request approved",
        actorEmail: "system:staff-workspace",
      });
      await db
        .from("data_requests")
        .update({ status: "completed", resolved_at: now, failure: null, updated_at: now })
        .eq("id", request.id);
      if (request.requested_by_email) {
        await sendPortalMail({
          to: request.requested_by_email,
          subject: `${request.org_name} has been deleted from Vistrial`,
          lines: [
            "The deletion you asked for has been carried out.",
            "The activity log and the billing records are kept. Your CRM was not changed.",
          ],
          idempotencyKey: `data-deleted:${request.id}`,
          category: "G",
          footer: {
            recipientEmail: request.requested_by_email,
            workspaceName: request.org_name,
            referenceId: request.id,
          },
        });
      }
      deleted += 1;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Deletion failed.";
      await db.from("data_requests").update({ failure: message.slice(0, 300), updated_at: now }).eq("id", request.id);
    }
  }

  const { data: exports } = await db
    .from("data_requests")
    .select("id, org_id, org_name, requested_by_user_id, requested_by_email")
    .eq("kind", "export")
    .eq("status", "in_progress");
  let exported = 0;
  for (const request of (exports ?? []) as Array<{ id: string; org_id: string; org_name: string; requested_by_user_id: string | null; requested_by_email: string | null }>) {
    try {
      const bundle = await buildOrgExport(db as unknown as GhlDb, request.org_id);
      const path = `${request.org_id}/data-request-${request.id}.json`;
      const { error: upload } = await db.storage
        .from(EXPORT_BUCKET)
        .upload(path, new Blob([exportJson(bundle)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
      if (upload) throw new Error(upload.message);
      const expires = new Date(Date.now() + linkDays * 86_400_000).toISOString();
      await db
        .from("data_requests")
        .update({
          status: "completed",
          export_path: path,
          export_ready_at: now,
          export_expires_at: expires,
          resolved_at: now,
          failure: null,
          updated_at: now,
        })
        .eq("id", request.id);
      if (request.requested_by_user_id) {
        const { data: member } = await db
          .from("org_members")
          .select("id")
          .eq("org_id", request.org_id)
          .eq("user_id", request.requested_by_user_id)
          .limit(1)
          .maybeSingle();
        const memberId = (member as { id: string } | null)?.id;
        if (memberId) {
          await queuePortalNotice({
            db: db as unknown as GhlDb,
            orgId: request.org_id,
            memberId,
            eventType: "data_request",
            title: "Your copy of this workspace is ready",
            body: `The download link works for ${linkDays} days. Open Privacy to get it.`,
            path: "/app/settings/privacy",
            dedupeKey: `data-export:${request.id}`,
          });
        }
      }
      exported += 1;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Export failed.";
      await db.from("data_requests").update({ failure: message.slice(0, 300), updated_at: now }).eq("id", request.id);
    }
  }
  return { deleted, exported };
}

/** Escalations, health, connection alerts, and approved data requests. */
export async function runStaffWorkspace(db: SupabaseClient): Promise<Record<string, unknown>> {
  const sweep = await db.rpc("staff_escalations_sweep");
  const { data: ruleRow } = await db
    .from("staff_health_rules")
    .select("version, rules")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = Number((ruleRow as { version?: number } | null)?.version ?? 1);
  const parsed = parseHealthRules((ruleRow as { rules?: unknown } | null)?.rules);
  const { data: facts } = await db.rpc("staff_roster_facts", { p_scope: "all", p_org_id: null, p_days: parsed.response_period_days });
  const healthChanged = await refreshHealth(db, (facts ?? []) as RosterFacts[], version, parsed);
  const { data: connections } = await db.rpc("staff_connections", { p_scope: "all", p_org_id: null });
  const connectionAlerts = await raiseConnections(db, (connections ?? []) as ConnectionRow[]);
  const requests = await notifyFlagged(db);
  const dataRequests = await runDataRequests(db);
  return { sweep: sweep.data ?? null, healthChanged, connectionAlerts, requests, dataRequests };
}
