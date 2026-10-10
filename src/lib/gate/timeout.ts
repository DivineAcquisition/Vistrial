import { gateAction } from "@/lib/gate/registry";

export const DEFAULT_WAIT_MINUTES = 240;

export type TimeoutChoice = "wait" | "escalate" | "proceed";

type ActionRule = { action?: unknown; max_wait_minutes?: unknown };

/** How long a request of this type may wait: its own longest wait, else the workspace's timeout. */
export function waitLimitMinutes(actionType: string, values: Record<string, unknown>, fallback = DEFAULT_WAIT_MINUTES): number {
  const rules = Array.isArray(values["approval.actions"]) ? (values["approval.actions"] as ActionRule[]) : [];
  const own = Number(rules.find((rule) => rule?.action === actionType)?.max_wait_minutes);
  if (Number.isFinite(own) && own >= 15) return Math.round(own);
  const general = Number(values["approval.timeout_minutes"]);
  if (Number.isFinite(general) && general >= 15) return Math.round(general);
  return fallback;
}

/**
 * What happens to a request nobody decided in time.
 * - "nothing": it keeps waiting and nobody is told.
 * - "escalate": it keeps waiting and the next person is told.
 * - "proceed": only for actions that stay inside the business, when the
 *   workspace confirmed it, and only where Vistrial can perform the action
 *   itself. Anything that reaches a lead or client is escalated instead.
 */
export function timeoutChoice(input: {
  actionType: string;
  values: Record<string, unknown>;
  vistrialCanPerform: boolean;
}): TimeoutChoice {
  const behavior = input.values["approval.timeout_behavior"];
  if (behavior === "nothing") return "wait";
  if (behavior !== "proceed") return "escalate";
  if (input.values["approval.timeout_proceed_confirmed"] !== true) return "escalate";
  const neverAuto = Array.isArray(input.values["approval.never_auto"]) ? (input.values["approval.never_auto"] as unknown[]) : [];
  if (neverAuto.includes(input.actionType)) return "escalate";
  if (gateAction(input.actionType).reachesPeople) return "escalate";
  if (!input.vistrialCanPerform) return "escalate";
  return "proceed";
}

export function waitedTooLong(createdAt: string, limitMinutes: number, now: Date): boolean {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && now.getTime() - created >= limitMinutes * 60_000;
}
