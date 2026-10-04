import "server-only";

import type { UIMessage } from "ai";

import { TOOL_LABELS, isSalesOsTool, toolTier, type SalesOsToolName } from "@/lib/sales-os/catalog";
import type { SalesOsActor } from "@/lib/sales-os/session";
import type { Json } from "@/types/database";

export type ConversationSummary = {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  lastMessageAt: string | null;
  createdAt: string;
  ownerName: string;
  isMine: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export async function createConversation(actor: SalesOsActor): Promise<string> {
  const { data, error } = await actor.db
    .from("sales_os_conversations")
    .insert({ org_id: actor.orgId, member_id: actor.memberId, user_id: actor.userId })
    .select("id")
    .single();
  if (error || !data) throw new Error("Couldn't start a conversation.");
  return data.id;
}

/** A conversation this person may write to: their own, in this workspace. */
export async function requireOwnConversation(actor: SalesOsActor, id: string) {
  if (!isConversationId(id)) return null;
  const { data } = await actor.db
    .from("sales_os_conversations")
    .select("id, user_id, title, status, context_package_id")
    .eq("org_id", actor.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data || data.user_id !== actor.userId) return null;
  return data;
}

export async function listConversations(actor: SalesOsActor, options: { everyone?: boolean } = {}): Promise<ConversationSummary[]> {
  let query = actor.db
    .from("sales_os_conversations")
    .select("id, title, status, last_message_at, created_at, user_id, member_id")
    .eq("org_id", actor.orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (!options.everyone) query = query.eq("user_id", actor.userId);
  const [{ data }, { data: members }] = await Promise.all([
    query,
    actor.db.from("org_members").select("id, display_name").eq("org_id", actor.orgId),
  ]);
  const names = new Map((members ?? []).map((m) => [m.id, m.display_name]));
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status === "archived" ? "archived" : "regular",
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    ownerName: names.get(row.member_id) ?? "Someone",
    isMine: row.user_id === actor.userId,
  }));
}

export async function loadConversationMessages(actor: SalesOsActor, conversationId: string): Promise<UIMessage[]> {
  const { data, error } = await actor.db
    .from("sales_os_messages")
    .select("id, role, parts, metadata")
    .eq("org_id", actor.orgId)
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true });
  if (error) throw new Error("Couldn't load the conversation.");
  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: (Array.isArray(row.parts) ? row.parts : []) as unknown as UIMessage["parts"],
    ...(row.metadata ? { metadata: row.metadata } : {}),
  }));
}

function firstUserText(messages: UIMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) return part.text.trim().replace(/\s+/g, " ").slice(0, 80);
    }
  }
  return null;
}

export async function saveConversationMessages(
  actor: SalesOsActor,
  conversationId: string,
  messages: UIMessage[],
  usage?: { model: string | null; inputTokens: number; outputTokens: number; cacheReadTokens: number }
): Promise<void> {
  const rows = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => ({
      id: message.id,
      conversation_id: conversationId,
      org_id: actor.orgId,
      seq: index + 1,
      role: message.role,
      parts: message.parts as unknown as Json,
      metadata: (message.metadata ?? null) as Json,
      acted_as_member_id: actor.memberId,
      updated_at: new Date().toISOString(),
      ...(usage && index === messages.length - 1 && message.role === "assistant"
        ? {
            model: usage.model,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cache_read_tokens: usage.cacheReadTokens,
          }
        : {}),
    }));
  if (rows.length === 0) return;
  const { error } = await actor.db.from("sales_os_messages").upsert(rows, { onConflict: "conversation_id,id" });
  if (error) throw new Error("Couldn't save the conversation.");
  const title = firstUserText(messages);
  await actor.db
    .from("sales_os_conversations")
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(title ? { title } : {}) })
    .eq("id", conversationId)
    .eq("user_id", actor.userId)
    .is("title", null);
  await actor.db
    .from("sales_os_conversations")
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", actor.userId);
}

export async function setConversationStatus(actor: SalesOsActor, id: string, status: "regular" | "archived") {
  await actor.db.from("sales_os_conversations").update({ status }).eq("id", id).eq("user_id", actor.userId);
}

export async function renameConversation(actor: SalesOsActor, id: string, title: string) {
  await actor.db
    .from("sales_os_conversations")
    .update({ title: title.trim().slice(0, 120) || null })
    .eq("id", id)
    .eq("user_id", actor.userId);
}

export async function pinContextPackage(actor: SalesOsActor, conversationId: string, packageId: string) {
  await actor.db
    .from("sales_os_conversations")
    .update({ context_package_id: packageId })
    .eq("id", conversationId)
    .eq("user_id", actor.userId);
}

export async function recordToolCall(
  actor: SalesOsActor,
  conversationId: string,
  args: { toolCallId: string; toolName: SalesOsToolName; input: unknown; state: "running" | "awaiting_approval" }
): Promise<void> {
  await actor.db.from("sales_os_tool_calls").upsert(
    {
      org_id: actor.orgId,
      conversation_id: conversationId,
      tool_call_id: args.toolCallId,
      tool_name: args.toolName,
      tier: toolTier(args.toolName),
      label: TOOL_LABELS[args.toolName].running,
      input: (args.input ?? {}) as Json,
      state: args.state,
      acted_as_member_id: actor.memberId,
      acted_as_user_id: actor.userId,
      acted_as_display_name: actor.personName,
      acted_as_role: actor.role,
    },
    { onConflict: "conversation_id,tool_call_id" }
  );
}

export type ToolCallEndState = "done" | "failed" | "permission" | "insufficient_data" | "rejected" | "awaiting_approval";

export async function finishToolCall(
  actor: SalesOsActor,
  conversationId: string,
  args: { toolCallId: string; toolName: string; state: ToolCallEndState; output: unknown; error?: string | null }
): Promise<void> {
  if (!isSalesOsTool(args.toolName)) return;
  const labels = TOOL_LABELS[args.toolName];
  await actor.db
    .from("sales_os_tool_calls")
    .update({
      state: args.state,
      output: (args.output ?? null) as Json,
      error_text: args.error ?? null,
      label: args.state === "failed" ? labels.failed : args.state === "awaiting_approval" ? labels.running : labels.done,
      finished_at: args.state === "awaiting_approval" ? null : new Date().toISOString(),
    })
    .eq("org_id", actor.orgId)
    .eq("conversation_id", conversationId)
    .eq("tool_call_id", args.toolCallId);
}

export type ToolCallRecord = {
  id: string;
  conversationId: string;
  conversationTitle: string | null;
  toolName: string;
  tier: string;
  label: string;
  state: string;
  actedAs: string;
  actedAsRole: string;
  startedAt: string;
  finishedAt: string | null;
  errorText: string | null;
};

/** The activity record: what Vistrial did, as whom, and when. */
export async function listToolCalls(
  actor: SalesOsActor,
  options: { from?: string; to?: string; limit?: number } = {}
): Promise<ToolCallRecord[]> {
  let query = actor.db
    .from("sales_os_tool_calls")
    .select("id, conversation_id, tool_name, tier, label, state, acted_as_display_name, acted_as_role, started_at, finished_at, error_text")
    .eq("org_id", actor.orgId)
    .order("started_at", { ascending: false })
    .limit(options.limit ?? 200);
  if (options.from) query = query.gte("started_at", options.from);
  if (options.to) query = query.lt("started_at", options.to);
  const { data } = await query;
  const ids = [...new Set((data ?? []).map((row) => row.conversation_id))];
  const { data: conversations } = ids.length
    ? await actor.db.from("sales_os_conversations").select("id, title").in("id", ids)
    : { data: [] as Array<{ id: string; title: string | null }> };
  const titles = new Map((conversations ?? []).map((c) => [c.id, c.title]));
  return (data ?? []).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    conversationTitle: titles.get(row.conversation_id) ?? null,
    toolName: row.tool_name,
    tier: row.tier,
    label: row.label,
    state: row.state,
    actedAs: row.acted_as_display_name,
    actedAsRole: row.acted_as_role,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorText: row.error_text,
  }));
}
