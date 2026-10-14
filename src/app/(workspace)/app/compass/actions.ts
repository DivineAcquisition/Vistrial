"use server";

import type { UIMessage } from "ai";
import { revalidatePath } from "next/cache";

import { reprocessCallsAction } from "@/app/(workspace)/app/cases/scribe-actions";
import { compassActor, unavailableMessage } from "@/lib/compass/actor";
import {
  createConversation,
  deleteConversation,
  isConversationId,
  listConversations,
  loadLegacyMessages,
  loadMessages,
  renameConversation,
  requireOwnConversation,
  type ConversationRow,
} from "@/lib/compass/persist";
import { startersFor, type Starter } from "@/lib/compass/starters";
import { isCompassContext, type CompassContext, type SuggestedAction } from "@/lib/compass/types";
import { getEffectiveConfig } from "@/lib/config/server";
import { recordCompassAction } from "@/lib/live/compass";

/**
 * Compass's server actions. Each one runs as the person; the database checks
 * them again. Confirming a suggestion is the only way a Compass suggestion
 * changes anything, and every kind goes through its existing flow.
 */

export type CompassResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

export async function listConversationsAction(search = ""): Promise<ConversationRow[]> {
  const actor = await compassActor();
  return listConversations(actor, search.slice(0, 80));
}

export async function createConversationAction(origin: "page" | "panel" = "page", context: unknown = { kind: "none" }): Promise<string> {
  const actor = await compassActor();
  const ctx: CompassContext = isCompassContext(context) ? context : { kind: "none" };
  return createConversation(actor, { origin: origin === "panel" ? "panel" : "page", context: ctx });
}

export async function fetchConversationAction(id: string): Promise<{ id: string; title: string | null } | null> {
  const actor = await compassActor();
  const row = await requireOwnConversation(actor, id);
  return row ? { id: row.id, title: row.title } : null;
}

export async function loadMessagesAction(id: string): Promise<UIMessage[]> {
  const actor = await compassActor();
  const row = await requireOwnConversation(actor, id);
  if (!row) return [];
  return loadMessages(actor, id);
}

export async function loadLegacyConversationAction(id: string): Promise<UIMessage[] | null> {
  const actor = await compassActor();
  return loadLegacyMessages(actor, id);
}

export async function renameConversationAction(id: string, title: string): Promise<void> {
  const actor = await compassActor();
  await renameConversation(actor, id, title);
}

export async function deleteConversationAction(id: string, legacy = false): Promise<CompassResult> {
  const actor = await compassActor();
  const ok = await deleteConversation(actor, id, legacy);
  return ok ? { ok: true, message: "Deleted." } : { ok: false, error: "That conversation could not be deleted." };
}

export async function shareConversationAction(id: string): Promise<CompassResult<{ until: string }>> {
  const actor = await compassActor();
  if (!isConversationId(id)) return { ok: false, error: "That conversation isn't available." };
  const { error } = await actor.db.rpc("compass_share", { p_conversation_id: id, p_days: 7, p_help_request_id: null });
  if (error) return { ok: false, error: "Could not share that conversation." };
  const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
  return { ok: true, message: "Shared with the Vistrial team for 7 days so they can help. You can stop sharing at any time.", data: { until } };
}

export async function unshareConversationAction(id: string): Promise<CompassResult> {
  const actor = await compassActor();
  const { error } = await actor.db.rpc("compass_unshare", { p_conversation_id: id });
  return error ? { ok: false, error: "Could not stop sharing." } : { ok: true, message: "The Vistrial team can no longer open it." };
}

export async function feedbackAction(messageId: string, rating: "up" | "down", reason: string | null = null): Promise<CompassResult> {
  const actor = await compassActor();
  if (typeof messageId !== "string" || messageId.length < 1 || messageId.length > 80) return { ok: false, error: "That answer isn't available." };
  const allowed = ["wrong_number", "wrong_lead", "not_helpful", "too_long", "missed_something", "other"];
  const { error } = await actor.db.from("compass_feedback").upsert(
    {
      org_id: actor.orgId,
      user_id: actor.userId,
      member_id: actor.memberId,
      message_id: messageId,
      rating: rating === "up" ? "up" : "down",
      reason: reason && allowed.includes(reason) ? reason : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,message_id" }
  );
  return error ? { ok: false, error: "Could not save that." } : { ok: true, message: "Thanks. That helps make Compass better." };
}

export async function listPinsAction(): Promise<Array<{ id: string; question: string }>> {
  const actor = await compassActor();
  const { data } = await actor.db.from("compass_pins").select("id, question").eq("org_id", actor.orgId).eq("user_id", actor.userId).order("created_at");
  return (data ?? []) as Array<{ id: string; question: string }>;
}

export async function unpinAction(id: string): Promise<CompassResult> {
  const actor = await compassActor();
  const { error } = await actor.db.from("compass_pins").delete().eq("id", id).eq("user_id", actor.userId);
  revalidatePath("/app/compass");
  return error ? { ok: false, error: "Could not unpin that." } : { ok: true };
}

export type PanelState = {
  available: boolean;
  message: string | null;
  context: CompassContext;
  starters: Starter[];
  pins: Array<{ id: string; question: string }>;
  staffNote: string | null;
};

const LEAD_PATH = /^\/app\/cases\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

function paramsOf(search: string, keys: string[]): Record<string, string> {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = query.get(key);
    if (value && value.length <= 80) out[key] = value;
  }
  return out;
}

/**
 * What the Ask Compass panel starts from on the page the person is on. The
 * context only narrows a question: a lead this person may not ask about
 * gives no context, the same as any other page.
 */
async function contextFor(actor: Awaited<ReturnType<typeof compassActor>>, pathname: string, search: string): Promise<CompassContext> {
  const lead = LEAD_PATH.exec(pathname);
  if (lead) {
    const leadId = lead[1].toLowerCase();
    const { data: allowed } = await actor.db.rpc("compass_lead_allowed", { p_org_id: actor.orgId, p_lead_id: leadId });
    if (allowed !== true) return { kind: "none" };
    const { data } = await actor.db.from("leads").select("first_name, last_name").eq("org_id", actor.orgId).eq("id", leadId).maybeSingle();
    const row = data as { first_name: string | null; last_name: string | null } | null;
    const name = row ? [row.first_name, row.last_name].filter(Boolean).join(" ").trim() : "";
    return { kind: "lead", leadId, label: name ? `${name}'s case file` : "This case file" };
  }
  if (pathname === "/app/cases" || pathname === "/app/queue") {
    const params = paramsOf(search, ["q", "status", "band", "source", "response", "fact", "factValue"]);
    return { kind: "list", params, label: Object.keys(params).length ? "This filtered lead list" : "Your lead list" };
  }
  if (pathname === "/app/home" || pathname === "/app/today") return { kind: "home", label: pathname === "/app/today" ? "Today" : "Home" };
  if (pathname === "/app/results" || pathname.startsWith("/app/results/")) {
    const params = paramsOf(search, ["range", "from", "to", "source", "person", "metric"]);
    return { kind: "results", params, label: "Results for this range" };
  }
  return { kind: "none" };
}

export async function panelStateAction(pathname: string, search = ""): Promise<PanelState> {
  const actor = await compassActor();
  if (!actor.available) {
    return { available: false, message: unavailableMessage(actor.unavailableReason), context: { kind: "none" }, starters: [], pins: [], staffNote: null };
  }
  const [context, config, pins] = await Promise.all([
    contextFor(actor, String(pathname ?? "").slice(0, 200), String(search ?? "").slice(0, 400)),
    getEffectiveConfig(actor.db, actor.orgId).catch(() => null),
    actor.db.from("compass_pins").select("id, question").eq("org_id", actor.orgId).eq("user_id", actor.userId).order("created_at"),
  ]);
  const pinRows = ((pins.data ?? []) as Array<{ id: string; question: string }>).slice(0, 20);
  const values = (config?.values ?? {}) as Record<string, unknown>;
  return {
    available: true,
    message: null,
    context,
    starters: startersFor(actor.access, values["industry.compass_questions"], pinRows.map((pin) => pin.question), 4),
    pins: pinRows,
    staffNote: actor.isStaff ? `You're using Compass as Vistrial staff inside ${actor.orgName}. Your conversations stay private to you.` : null,
  };
}

/** Finds the suggestion Compass actually offered in this person's own conversation. */
function findSuggestion(messages: UIMessage[], suggestionId: string): SuggestedAction | null {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts as Array<{ type: string; output?: unknown }>) {
      if (part.type !== "tool-suggest_action") continue;
      const suggestion = (part.output as { data?: { suggestion?: SuggestedAction } } | undefined)?.data?.suggestion;
      if (suggestion && suggestion.id === suggestionId) return suggestion;
    }
  }
  return null;
}

export async function confirmSuggestionAction(conversationId: string, suggestionId: string): Promise<CompassResult<{ href?: string }>> {
  const actor = await compassActor();
  const conversation = await requireOwnConversation(actor, conversationId);
  if (!conversation) return { ok: false, error: "That conversation isn't available." };
  if (!actor.available) return { ok: false, error: "Compass is not available right now." };
  const suggestion = findSuggestion(await loadMessages(actor, conversationId), suggestionId);
  if (!suggestion) return { ok: false, error: "That suggestion isn't available any more." };
  if (suggestion.unavailable) return { ok: false, error: suggestion.unavailable };

  const { data: done } = await actor.db
    .from("agent_activity_runs")
    .select("id")
    .eq("org_id", actor.orgId)
    .eq("agent_id", "compass")
    .eq("trigger_key", `compass-action:${suggestionId}`)
    .neq("status", "failed")
    .maybeSingle();
  if (done) return { ok: false, error: "You already confirmed this." };

  const record = (label: string, outcome: "done" | "refused", detail?: string) =>
    recordCompassAction({ orgId: actor.orgId, memberId: actor.memberId, suggestionId, label, outcome, detail });

  switch (suggestion.kind) {
    case "relay_draft": {
      if (!suggestion.leadId) return { ok: false, error: "That suggestion has no lead." };
      const { data, error } = await actor.db.rpc("compass_request_draft", { p_org_id: actor.orgId, p_lead_id: suggestion.leadId });
      const result = data as { ok?: boolean; reason?: string } | null;
      if (error || !result?.ok) {
        const reason = result?.reason ?? "You can't ask Relay for a draft for this lead.";
        await record("Asked Relay for a draft", "refused", reason);
        return { ok: false, error: reason };
      }
      await record("Asked Relay for a draft", "done", "Relay will prepare it and send it to the approval queue.");
      revalidatePath("/app/home");
      return { ok: true, message: "Relay will prepare a draft. It will wait in the approval queue; nothing is sent without approval.", data: { href: "/app/home" } };
    }
    case "scribe_refresh": {
      if (!suggestion.leadId) return { ok: false, error: "That suggestion has no lead." };
      const result = await reprocessCallsAction({ leadId: suggestion.leadId, days: 90, reason: "Asked from Compass", confirmed: true });
      if (!result.ok) {
        await record("Asked Scribe to rebuild a case file", "refused", result.error);
        return { ok: false, error: result.error };
      }
      await actor.db.rpc("compass_record_action", { p_org_id: actor.orgId, p_action: "scribe_refresh_requested", p_lead_id: suggestion.leadId, p_detail: {} });
      await record("Asked Scribe to rebuild a case file", "done");
      return { ok: true, message: "Scribe will read this lead's calls again. The case file updates in a few minutes." };
    }
    case "next_action": {
      if (!suggestion.leadId) return { ok: false, error: "That suggestion has no lead." };
      const due = suggestion.dueAt && !Number.isNaN(Date.parse(suggestion.dueAt)) ? new Date(suggestion.dueAt).toISOString() : null;
      const { error } = await actor.db.rpc("compass_create_next_action", {
        p_org_id: actor.orgId,
        p_lead_id: suggestion.leadId,
        p_text: suggestion.text ?? "Follow up",
        p_due_at: due,
      });
      if (error) {
        await record("Added a follow-up", "refused", "That follow-up could not be added.");
        return { ok: false, error: "That follow-up could not be added." };
      }
      await record("Added a follow-up", "done");
      revalidatePath(`/app/cases/${suggestion.leadId}`);
      return { ok: true, message: "Added to your follow-ups." };
    }
    case "pin_question": {
      const question = (suggestion.text ?? "").trim();
      const { error } = await actor.db.from("compass_pins").insert({ org_id: actor.orgId, user_id: actor.userId, question: question.slice(0, 300) });
      if (error) return { ok: false, error: /pin up to/.test(error.message) ? "You can pin up to 20 questions. Unpin one first." : "Could not pin that question." };
      await actor.db.rpc("compass_record_action", { p_org_id: actor.orgId, p_action: "question_pinned", p_lead_id: null, p_detail: {} });
      await record("Pinned a question", "done");
      revalidatePath("/app/compass");
      return { ok: true, message: "Pinned. It shows when you open Compass." };
    }
    case "open_list":
    case "open_case_file":
      await actor.db.rpc("compass_record_action", {
        p_org_id: actor.orgId,
        p_action: suggestion.kind === "open_list" ? "opened_list" : "opened_case_file",
        p_lead_id: suggestion.leadId ?? null,
        p_detail: {},
      });
      return { ok: true, data: { href: suggestion.href ?? undefined } };
  }
}

export async function dismissSuggestionAction(conversationId: string, suggestionId: string): Promise<CompassResult> {
  const actor = await compassActor();
  const conversation = await requireOwnConversation(actor, conversationId);
  if (!conversation) return { ok: false, error: "That conversation isn't available." };
  const suggestion = findSuggestion(await loadMessages(actor, conversationId), suggestionId);
  if (!suggestion) return { ok: true };
  await actor.db.rpc("compass_record_action", {
    p_org_id: actor.orgId,
    p_action: "suggestion_dismissed",
    p_lead_id: suggestion.leadId ?? null,
    p_detail: { kind: suggestion.kind },
  });
  return { ok: true };
}
