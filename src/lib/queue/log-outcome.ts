import "server-only";

import { canAssignLeadTo } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { revalidateLeadSurfaces } from "@/lib/leads/revalidate";
import { describeOutcomeDiscrepancy } from "@/lib/mobile/discrepancy";
import { isClientSurface } from "@/lib/mobile/surface";
import { fetchQueueRow } from "@/lib/queue/load";
import {
  TOUCH_CHANNELS,
  TOUCH_DIRECTIONS,
  TOUCH_OUTCOMES,
  type LogOutcomeInput,
  type QueueActionResult,
  type TouchChannel,
  type TouchDirection,
  type TouchOutcome,
} from "@/lib/queue/types";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

function isChannel(value: string): value is TouchChannel {
  return (TOUCH_CHANNELS as readonly string[]).includes(value);
}

function isDirection(value: string): value is TouchDirection {
  return (TOUCH_DIRECTIONS as readonly string[]).includes(value);
}

function isOutcome(value: string): value is TouchOutcome {
  return (TOUCH_OUTCOMES as readonly string[]).includes(value);
}

function actionError(error: string): QueueActionResult {
  return { ok: false, error };
}

function explainWriteError(message: string | undefined, fallback: string): string {
  const text = message ?? "";
  if (text.toLowerCase().includes("not authorized to reassign")) {
    return "You can assign this lead to yourself, but not to someone else.";
  }
  if (text.toLowerCase().includes("row-level security") || text.toLowerCase().includes("42501")) {
    return "You do not have permission to do that.";
  }
  return fallback;
}

function resolveOccurredAt(clientLoggedAt: string | undefined): string {
  const now = Date.now();
  if (!clientLoggedAt) return new Date(now).toISOString();
  const parsed = Date.parse(clientLoggedAt);
  if (!Number.isFinite(parsed)) return new Date(now).toISOString();
  if (parsed > now + 60_000) return new Date(now).toISOString();
  const week = 7 * 24 * 60 * 60 * 1000;
  if (now - parsed > week) return new Date(now - week).toISOString();
  return new Date(parsed).toISOString();
}

function isLeadStatus(value: string | null | undefined): value is Enums<"lead_status"> {
  if (!value) return false;
  return [
    "new",
    "working",
    "call_booked",
    "no_show",
    "follow_up",
    "objection_hold",
    "ghost",
    "closed_won",
    "closed_lost",
  ].includes(value);
}

export async function writeQueueOutcome(input: LogOutcomeInput): Promise<QueueActionResult> {
  const ctx = await getAuthContext();
  if (!isChannel(input.channel)) return actionError("Pick a channel.");
  if (!isDirection(input.direction)) return actionError("Pick inbound or outbound.");
  if (!isOutcome(input.outcome)) return actionError("Pick an outcome.");

  const note = input.note?.trim() ?? "";
  if (note.length > 280) return actionError("Keep the note under 280 characters.");

  const actorMemberId = input.actorMemberId?.trim() || ctx.member.id;
  if (
    actorMemberId !== ctx.member.id &&
    !canAssignLeadTo({
      role: ctx.role,
      actorMemberId: ctx.member.id,
      targetMemberId: actorMemberId,
      isPlatformAdmin: ctx.isPlatformAdmin,
    })
  ) {
    return actionError("Only an owner or admin can log an outcome as someone else.");
  }

  const clientSurface = isClientSurface(input.clientSurface ?? "") ? input.clientSurface : null;
  const clientEventId = input.clientEventId?.trim() || null;
  const occurredAt = resolveOccurredAt(input.clientLoggedAt);

  const supabase = await createClient();
  const { data: actor, error: actorError } = await supabase
    .from("org_members")
    .select("id, active")
    .eq("org_id", ctx.org.id)
    .eq("id", actorMemberId)
    .maybeSingle();

  if (actorError || !actor || !actor.active) {
    return actionError("That teammate is not an active member of this workspace.");
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, status, last_touch_at, first_human_touch_at")
    .eq("org_id", ctx.org.id)
    .eq("id", input.leadId)
    .maybeSingle();

  if (leadError || !lead) return actionError("That lead is not in this workspace.");

  const discrepancy = describeOutcomeDiscrepancy(
    {
      status: input.expectedLeadStatus ?? null,
      lastTouchAt: input.expectedLastTouchAt ?? null,
      firstHumanTouchAt: input.expectedFirstHumanTouchAt ?? null,
    },
    {
      status: lead.status,
      lastTouchAt: lead.last_touch_at,
      firstHumanTouchAt: lead.first_human_touch_at,
    }
  );

  if (clientEventId) {
    const { data: existing } = await supabase
      .from("touches")
      .select("id")
      .eq("org_id", ctx.org.id)
      .eq("client_event_id", clientEventId)
      .maybeSingle();
    if (existing) {
      const row = await fetchQueueRow(supabase, ctx.org.id, input.leadId);
      return { ok: true, row, duplicate: true, discrepancy };
    }
  }

  const { error } = await supabase.from("touches").insert({
    org_id: ctx.org.id,
    lead_id: input.leadId,
    type: "human",
    channel: input.channel,
    direction: input.direction,
    outcome: input.outcome,
    actor_member_id: actorMemberId,
    summary: note || null,
    occurred_at: occurredAt,
    client_surface: clientSurface,
    queued_offline: Boolean(input.queuedOffline),
    client_logged_at: input.clientLoggedAt ? occurredAt : null,
    client_event_id: clientEventId,
    expected_lead_status: isLeadStatus(input.expectedLeadStatus) ? input.expectedLeadStatus : null,
    sync_discrepancy: discrepancy ? { plain: discrepancy } : null,
  });

  if (error) {
    if (error.code === "23505" && clientEventId) {
      const row = await fetchQueueRow(supabase, ctx.org.id, input.leadId);
      return { ok: true, row, duplicate: true, discrepancy };
    }
    return actionError(explainWriteError(error.message, "Could not log that outcome."));
  }

  revalidateLeadSurfaces(input.leadId);
  const row = await fetchQueueRow(supabase, ctx.org.id, input.leadId);
  return { ok: true, row, discrepancy };
}
