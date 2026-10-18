import type { Tier } from "@/lib/assay/types";
import { TIER_LABEL } from "@/lib/assay/types";

export const DO_NOT_CONTACT_LABEL = "Do not contact";

export const NO_CALL_NOTE = "No call yet. Score is based on fit and activity.";
export const CALL_PENDING_NOTE = "Call details pending.";
export const UNCLEAR_CALL_NOTE = "Unclear from the call.";
export const LEARNING_NOTE = "Using industry defaults. Learning starts after 40 closed deals.";
export const EARLY_NOTE = "Early score. A thin reading, so it will not raise a Hot alert on its own.";
export const TIERS_NOT_SEPARATING = "Assay tiers are not separating winners well. Review the rules.";

export function hiddenCallReasonLine(count: number): string {
  if (count === 1) return "1 reason based on a call is hidden for your access level.";
  return `${count} reasons based on a call are hidden for your access level.`;
}

export function tierChipLabel(tier: Tier | "do_not_contact", score: number | null, early: boolean): string {
  if (tier === "do_not_contact") return DO_NOT_CONTACT_LABEL;
  const number = score == null ? "" : ` ${score}`;
  const earlyMark = early ? " · Early" : "";
  return `${TIER_LABEL[tier]}${number}${earlyMark}`;
}

export function historyLine(from: Tier | null, to: Tier, whenLabel: string, because: string): string {
  const move = from && from !== to ? `${TIER_LABEL[from]} to ${TIER_LABEL[to]}` : TIER_LABEL[to];
  return `${move} on ${whenLabel}: ${because}`;
}

export function taskTitle(displayName: string, triggerLabel: string, because: string): string {
  const who = displayName.trim() || "this lead";
  const reason = because.trim();
  return reason ? `Call ${who} today. ${triggerLabel}: ${reason}` : `Call ${who} today. ${triggerLabel}.`;
}

export const TRIGGER_LABEL: Record<string, string> = {
  became_hot: "Became Hot",
  big_jump: "Score jumped",
  going_quiet: "Hot lead going quiet",
  hot_no_show: "Missed a booking",
};

export function summaryNotice(count: number): { title: string; body: string } {
  const n = Math.max(1, count);
  return {
    title: "More leads need attention",
    body: `${n} more ${n === 1 ? "lead needs" : "leads need"} attention. Open your queue.`,
  };
}
