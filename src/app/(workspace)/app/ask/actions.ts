"use server";

import type { UIMessage } from "ai";
import { revalidatePath } from "next/cache";

import type { AssetView } from "@/lib/sales-os/asset-types";
import { assetHistory, markAssetReviewed, saveAssetEdit } from "@/lib/sales-os/assets";
import { listPendingApprovals, loadExecutionPreview, revisePendingExecution } from "@/lib/sales-os/executions/run";
import type { ExecutionPreview, PendingApproval } from "@/lib/sales-os/executions/types";
import {
  createConversation,
  isConversationId,
  listConversations,
  loadConversationMessages,
  renameConversation,
  requireOwnConversation,
  setConversationStatus,
  type ConversationSummary,
} from "@/lib/sales-os/persist";
import { salesOsActor } from "@/lib/sales-os/session";

export async function listConversationsAction(): Promise<ConversationSummary[]> {
  return listConversations(await salesOsActor());
}

export async function createConversationAction(): Promise<string> {
  return createConversation(await salesOsActor());
}

export async function fetchConversationAction(id: string): Promise<ConversationSummary | null> {
  const actor = await salesOsActor();
  if (!isConversationId(id)) return null;
  const rows = await listConversations(actor, { everyone: actor.canSeeMoney });
  return rows.find((row) => row.id === id) ?? null;
}

/** RLS decides what comes back: your own conversations, or the team's if you're an owner or admin. */
export async function loadConversationMessagesAction(id: string): Promise<UIMessage[]> {
  if (!isConversationId(id)) return [];
  return loadConversationMessages(await salesOsActor(), id);
}

export async function renameConversationAction(id: string, title: string): Promise<void> {
  const actor = await salesOsActor();
  if (await requireOwnConversation(actor, id)) await renameConversation(actor, id, title);
}

export async function archiveConversationAction(id: string): Promise<void> {
  const actor = await salesOsActor();
  if (await requireOwnConversation(actor, id)) await setConversationStatus(actor, id, "archived");
}

export async function unarchiveConversationAction(id: string): Promise<void> {
  const actor = await salesOsActor();
  if (await requireOwnConversation(actor, id)) await setConversationStatus(actor, id, "regular");
}

export async function listPendingApprovalsAction(): Promise<PendingApproval[]> {
  const actor = await salesOsActor();
  return listPendingApprovals(actor.db, actor.orgId);
}

export async function reviseExecutionAction(input: {
  conversationId: string;
  toolCallId: string;
  title: string;
  summary: string;
  sections: Array<{ heading: string; bullets: string[] }>;
  fileName: string | null;
}): Promise<{ ok: true; preview: string; plainSummary: string } | { ok: false; error: string }> {
  const actor = await salesOsActor();
  if (!(await requireOwnConversation(actor, input.conversationId))) {
    return { ok: false, error: "That conversation isn't yours to change." };
  }
  return revisePendingExecution({ ...actor, conversationId: input.conversationId }, input);
}

export async function loadExecutionPreviewAction(conversationId: string, toolCallId: string): Promise<ExecutionPreview | null> {
  if (!isConversationId(conversationId) || !toolCallId) return null;
  const actor = await salesOsActor();
  return loadExecutionPreview(actor.db, actor.orgId, conversationId, toolCallId.slice(0, 200));
}

type AssetResult = { ok: true; asset: AssetView } | { ok: false; error: string };

export async function saveAssetEditAction(input: { assetId: string; title: string; body: string }): Promise<AssetResult> {
  try {
    const actor = await salesOsActor();
    const asset = await saveAssetEdit({ ...actor, conversationId: null }, input);
    revalidatePath("/app/ask/assets");
    return { ok: true, asset };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Couldn't save that." };
  }
}

export async function markAssetReviewedAction(assetId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await salesOsActor();
    await markAssetReviewed({ ...actor, conversationId: null }, assetId);
    revalidatePath("/app/ask/assets");
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Couldn't mark it reviewed." };
  }
}

export async function assetHistoryAction(familyId: string): Promise<AssetView[]> {
  const actor = await salesOsActor();
  return assetHistory(actor, familyId);
}
