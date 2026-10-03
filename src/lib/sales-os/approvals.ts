import type { UIMessage } from "ai";

import type { ApprovalDecision } from "@/lib/sales-os/executions/run";

type ToolPartLike = {
  type: string;
  toolCallId?: string;
  state?: string;
  approval?: { id?: string; approved?: boolean; reason?: string; signature?: string; [key: string]: unknown };
  [key: string]: unknown;
};

function isToolPart(part: unknown): part is ToolPartLike {
  return Boolean(part && typeof part === "object" && typeof (part as ToolPartLike).type === "string" && (part as ToolPartLike).type.startsWith("tool-"));
}

/**
 * Takes only approval decisions from the browser's copy of the last message.
 * Everything else (the tool input, the approval id, the signature) comes from
 * the server's stored copy, so a browser can't change what was asked for.
 */
export function mergeApprovalResponses(
  stored: UIMessage[],
  incoming: UIMessage
): { messages: UIMessage[]; decisions: ApprovalDecision[] } | null {
  const last = stored.at(-1);
  if (!last || last.role !== "assistant" || last.id !== incoming.id) return null;
  const decisions: ApprovalDecision[] = [];
  const responses = new Map<string, ToolPartLike>();
  for (const part of incoming.parts as unknown[]) {
    if (isToolPart(part) && part.state === "approval-responded" && part.toolCallId && part.approval?.id) {
      responses.set(part.toolCallId, part);
    }
  }
  const parts = (last.parts as unknown[]).map((part) => {
    if (!isToolPart(part) || part.state !== "approval-requested" || !part.toolCallId || !part.approval?.id) return part;
    const response = responses.get(part.toolCallId);
    if (!response || response.approval?.id !== part.approval.id || typeof response.approval?.approved !== "boolean") return part;
    const reason = typeof response.approval.reason === "string" ? response.approval.reason.slice(0, 500) : undefined;
    decisions.push({ toolCallId: part.toolCallId, approved: response.approval.approved, reason: reason ?? null });
    return {
      ...part,
      state: "approval-responded",
      approval: { ...part.approval, approved: response.approval.approved, ...(reason ? { reason } : {}) },
    };
  });
  if (decisions.length === 0) return null;
  return { messages: [...stored.slice(0, -1), { ...last, parts: parts as UIMessage["parts"] }], decisions };
}

/** A decision the database refused is turned into a denial, so nothing runs on an unrecorded approval. */
export function denyUnrecorded(
  messages: UIMessage[],
  refused: Array<{ toolCallId: string; error: string | null }>
): UIMessage[] {
  if (refused.length === 0) return messages;
  const byId = new Map(refused.map((r) => [r.toolCallId, r.error ?? "The approval couldn't be recorded."]));
  const last = messages.at(-1);
  if (!last) return messages;
  const parts = (last.parts as unknown[]).map((part) => {
    if (!isToolPart(part) || !part.toolCallId || !byId.has(part.toolCallId) || part.state !== "approval-responded") return part;
    return { ...part, approval: { ...part.approval, approved: false, reason: byId.get(part.toolCallId) } };
  });
  return [...messages.slice(0, -1), { ...last, parts: parts as UIMessage["parts"] }];
}

export function pendingApprovalToolCallIds(message: UIMessage | undefined): string[] {
  if (!message) return [];
  return (message.parts as unknown[]).flatMap((part) =>
    isToolPart(part) && part.state === "approval-requested" && part.toolCallId ? [part.toolCallId] : []
  );
}
