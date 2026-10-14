import "server-only";

import type { UIMessage } from "ai";

import type { CompassActor } from "@/lib/compass/actor";
import { cleanTitle } from "@/lib/compass/titles";
import type { CompassContext } from "@/lib/compass/types";

/**
 * Compass conversations, read and written as the person. Row-level security
 * keeps every conversation to its author; nothing here reads anyone else's.
 */

export type ConversationRow = {
  id: string;
  title: string | null;
  origin: "page" | "panel";
  context: CompassContext;
  lastMessageAt: string | null;
  createdAt: string;
  legacy: boolean;
  shared: { until: string } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export async function createConversation(actor: CompassActor, input: { origin: "page" | "panel"; context: CompassContext }): Promise<string> {
  const { data, error } = await actor.db
    .from("compass_conversations")
    .insert({ org_id: actor.orgId, user_id: actor.userId, member_id: actor.memberId, origin: input.origin, context: input.context })
    .select("id")
    .single();
  if (error || !data) throw new Error("Couldn't start a conversation.");
  return String((data as { id: string }).id);
}

export async function requireOwnConversation(actor: CompassActor, id: string) {
  if (!isConversationId(id)) return null;
  const { data } = await actor.db
    .from("compass_conversations")
    .select("id, user_id, title, origin, context, message_count")
    .eq("org_id", actor.orgId)
    .eq("id", id)
    .maybeSingle();
  const row = data as { id: string; user_id: string; title: string | null; origin: "page" | "panel"; context: CompassContext; message_count: number } | null;
  if (!row || row.user_id !== actor.userId) return null;
  return row;
}

export async function listConversations(actor: CompassActor, search = ""): Promise<ConversationRow[]> {
  const needle = search.trim().toLowerCase();
  const [{ data: rows }, { data: legacy }, { data: shares }] = await Promise.all([
    actor.db
      .from("compass_conversations")
      .select("id, title, origin, context, last_message_at, created_at")
      .eq("org_id", actor.orgId)
      .eq("user_id", actor.userId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200),
    actor.db
      .from("sales_os_conversations")
      .select("id, title, last_message_at, created_at")
      .eq("org_id", actor.orgId)
      .eq("user_id", actor.userId)
      .is("text_deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    actor.db.from("compass_shares").select("conversation_id, expires_at, revoked_at").eq("org_id", actor.orgId).is("revoked_at", null),
  ]);
  const now = Date.now();
  const sharedUntil = new Map(
    ((shares ?? []) as Array<{ conversation_id: string; expires_at: string }>)
      .filter((share) => Date.parse(share.expires_at) > now)
      .map((share) => [share.conversation_id, share.expires_at])
  );
  const out: ConversationRow[] = [
    ...((rows ?? []) as Array<{ id: string; title: string | null; origin: "page" | "panel"; context: CompassContext; last_message_at: string | null; created_at: string }>).map(
      (row) => ({
        id: row.id,
        title: row.title,
        origin: row.origin,
        context: row.context ?? { kind: "none" },
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at,
        legacy: false,
        shared: sharedUntil.has(row.id) ? { until: sharedUntil.get(row.id)! } : null,
      })
    ),
    ...((legacy ?? []) as Array<{ id: string; title: string | null; last_message_at: string | null; created_at: string }>).map((row) => ({
      id: row.id,
      title: row.title ? `${row.title}` : "An earlier conversation",
      origin: "page" as const,
      context: { kind: "none" } as CompassContext,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      legacy: true,
      shared: null,
    })),
  ];
  return needle ? out.filter((row) => (row.title ?? "").toLowerCase().includes(needle)) : out;
}

export async function loadMessages(actor: CompassActor, conversationId: string): Promise<UIMessage[]> {
  const { data, error } = await actor.db
    .from("compass_messages")
    .select("id, role, parts, metadata")
    .eq("org_id", actor.orgId)
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true });
  if (error) throw new Error("Couldn't load the conversation.");
  return ((data ?? []) as Array<{ id: string; role: string; parts: unknown; metadata: unknown }>).map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: (Array.isArray(row.parts) ? row.parts : []) as UIMessage["parts"],
    ...(row.metadata ? { metadata: row.metadata } : {}),
  }));
}

/** An old Ask Vistrial conversation, read-only, for its author only. */
export async function loadLegacyMessages(actor: CompassActor, conversationId: string): Promise<UIMessage[] | null> {
  if (!isConversationId(conversationId)) return null;
  const { data: conversation } = await actor.db
    .from("sales_os_conversations")
    .select("id, user_id, text_deleted_at")
    .eq("org_id", actor.orgId)
    .eq("id", conversationId)
    .maybeSingle();
  const row = conversation as { id: string; user_id: string; text_deleted_at: string | null } | null;
  if (!row || row.user_id !== actor.userId || row.text_deleted_at) return null;
  const { data } = await actor.db
    .from("sales_os_messages")
    .select("id, role, parts")
    .eq("org_id", actor.orgId)
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true });
  return ((data ?? []) as Array<{ id: string; role: string; parts: unknown }>).map((m) => ({
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: (Array.isArray(m.parts) ? m.parts : []) as UIMessage["parts"],
  }));
}

export async function saveMessages(actor: CompassActor, conversationId: string, messages: UIMessage[]): Promise<void> {
  const now = new Date().toISOString();
  const rows = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => ({
      conversation_id: conversationId,
      id: message.id,
      org_id: actor.orgId,
      seq: index + 1,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata ?? null,
      updated_at: now,
    }));
  if (!rows.length) return;
  const { error } = await actor.db.from("compass_messages").upsert(rows, { onConflict: "conversation_id,id", defaultToNull: false });
  if (error) throw new Error("Couldn't save the conversation.");
  await actor.db
    .from("compass_conversations")
    .update({ last_message_at: now, updated_at: now, message_count: rows.length })
    .eq("id", conversationId)
    .eq("user_id", actor.userId);
}

/** Removes one unanswered question so a retry replaces it. */
export async function dropMessage(actor: CompassActor, conversationId: string, messageId: string): Promise<void> {
  await actor.db.from("compass_messages").delete().eq("conversation_id", conversationId).eq("id", messageId).eq("role", "user");
}

export async function setTitleIfMissing(actor: CompassActor, conversationId: string, title: string): Promise<void> {
  await actor.db.from("compass_conversations").update({ title }).eq("id", conversationId).eq("user_id", actor.userId).is("title", null);
}

export async function renameConversation(actor: CompassActor, id: string, title: string): Promise<void> {
  if (!isConversationId(id)) return;
  await actor.db.from("compass_conversations").update({ title: cleanTitle(title), updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", actor.userId);
}

/** Deleting removes the conversation and its messages at once (and any share of it). */
export async function deleteConversation(actor: CompassActor, id: string, legacy: boolean): Promise<boolean> {
  if (!isConversationId(id)) return false;
  if (legacy) {
    const { error } = await actor.db.rpc("compass_legacy_delete", { p_conversation_id: id });
    return !error;
  }
  const { error, count } = await actor.db
    .from("compass_conversations")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", actor.userId);
  return !error && (count ?? 0) > 0;
}
