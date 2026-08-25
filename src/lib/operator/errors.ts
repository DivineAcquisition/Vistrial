import type { ToolFailureKind } from "@/lib/operator/types";

const PERMISSION_FRAGMENT =
  /not authorized|permission|owner\/admin|owner and admin|row-level security|42501|only override|assign this lead to yourself|assign this action to yourself|only work drafts/i;

export function classifyToolError(message: string): {
  kind: Exclude<ToolFailureKind, "cancelled" | "batch_cap">;
  error: string;
} {
  const text = message.trim() || "That did not work.";
  if (PERMISSION_FRAGMENT.test(text)) {
    return {
      kind: "permission",
      error: /permission|authorized|owner|yourself|override|drafts/i.test(text)
        ? text
        : "You do not have permission to do that.",
    };
  }
  return { kind: "failed", error: text };
}

export function permissionDenied(detail: string): {
  kind: "permission";
  error: string;
  ok: false;
  summary: string;
  leadIds: string[];
} {
  return {
    ok: false,
    kind: "permission",
    error: detail,
    summary: detail,
    leadIds: [],
  };
}

export function batchCapDenied(count: number, cap: number): {
  kind: "batch_cap";
  error: string;
  ok: false;
  summary: string;
  leadIds: string[];
} {
  const error = `This would change ${count} records. The cap is ${cap} per confirmed action. Narrow the request or split it. Nothing was truncated and nothing was changed.`;
  return { ok: false, kind: "batch_cap", error, summary: error, leadIds: [] };
}

export function isPermissionMessage(message: string): boolean {
  return PERMISSION_FRAGMENT.test(message);
}
