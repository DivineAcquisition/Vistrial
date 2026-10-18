import { TRIGGER_LABEL, summaryNotice, taskTitle } from "@/lib/assay/copy";
import type { ScoreMode, ScoreResult, Tier, TriggerId, TriggerSettings } from "@/lib/assay/types";

export type BillingGate = "ok" | "restricted" | "suspended" | "closed";

export type ActionContext = {
  mode: ScoreMode;
  previousScore: number | null;
  previousTier: Tier | null;
  score24hAgo: number | null;
  previousFingerprint: string | null;
  contactable: boolean;
  openTaskId: string | null;
  lastFiredAt: Partial<Record<TriggerId, string>>;
  now: string;
  personTasksToday: number;
  workspaceTasksToday: number;
  workspaceDraftsToday: number;
  pendingDraft: boolean;
  activePlaybook: boolean;
  billing: BillingGate;
  displayName: string;
  triggers: TriggerSettings;
  caps: {
    tasksPerPersonPerDay: number;
    tasksPerWorkspacePerDay: number;
    draftsPerWorkspacePerDay: number;
    triggerCooldownHours: number;
  };
  leadSilenceDays: number;
  teamSilenceDays: number;
  noShow: boolean;
};

export type AssayAction =
  | { kind: "task"; trigger: TriggerId; taskId: string | null; title: string; because: string; update: boolean }
  | { kind: "notice"; trigger: TriggerId; urgent: boolean; title: string; body: string }
  | { kind: "summary"; title: string; body: string }
  | { kind: "draft"; trigger: TriggerId; style: "follow_up" | "reschedule"; because: string }
  | { kind: "boost"; trigger: TriggerId; because: string }
  | { kind: "cap"; scope: "person" | "workspace_tasks" | "workspace_drafts" };

export type Decision = {
  skipped: "replay" | "closed" | "billing" | null;
  actions: AssayAction[];
  triggers: TriggerId[];
};

const URGENT: Record<TriggerId, boolean> = {
  became_hot: true,
  big_jump: false,
  going_quiet: false,
  hot_no_show: true,
};

function hoursBetween(earlier: string, later: string): number {
  return (Date.parse(later) - Date.parse(earlier)) / 36e5;
}

function cooled(last: string | undefined, now: string, hours: number): boolean {
  if (!last) return true;
  return hoursBetween(last, now) >= hours;
}

export function liveTriggers(result: ScoreResult, ctx: ActionContext): TriggerId[] {
  if (ctx.mode === "historic" || ctx.mode === "rules_change") return [];
  if (result.score === ctx.previousScore && result.tier === ctx.previousTier && ctx.mode !== "nightly") return [];
  const found: TriggerId[] = [];
  const settings = ctx.triggers;
  if (ctx.mode === "live" && settings.becameHot && result.tier === "hot" && ctx.previousTier !== "hot" && !result.early) {
    found.push("became_hot");
  }
  if (ctx.mode === "live" && settings.bigJump) {
    const baseline = ctx.score24hAgo ?? ctx.previousScore;
    if (baseline != null && result.score - baseline >= settings.bigJumpPoints) found.push("big_jump");
  }
  if ((ctx.mode === "live" || ctx.mode === "nightly") && settings.goingQuiet && result.tier === "hot") {
    if (ctx.leadSilenceDays >= settings.goingQuietDays && ctx.teamSilenceDays >= settings.goingQuietDays) {
      found.push("going_quiet");
    }
  }
  if (ctx.mode === "live" && settings.hotNoShow && ctx.noShow && (result.tier === "hot" || result.tier === "warm")) {
    found.push("hot_no_show");
  }
  return found.filter((trigger) => cooled(ctx.lastFiredAt[trigger], ctx.now, ctx.caps.triggerCooldownHours));
}

function because(result: ScoreResult, trigger: TriggerId): string {
  const top = result.fired
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((item) => item.reason.replace(/\.$/, "").toLowerCase());
  if (trigger === "hot_no_show") return "missed a booked visit";
  if (trigger === "going_quiet") return "no recent activity";
  return top.join(" and ") || TRIGGER_LABEL[trigger].toLowerCase();
}

export function planActions(result: ScoreResult, ctx: ActionContext): Decision {
  if (ctx.previousFingerprint && ctx.previousFingerprint === result.fingerprint) {
    return { skipped: "replay", actions: [], triggers: [] };
  }
  if (ctx.billing === "closed") return { skipped: "closed", actions: [], triggers: [] };
  const triggers = liveTriggers(result, ctx);
  if (ctx.billing === "suspended" || !ctx.contactable) {
    return { skipped: ctx.billing === "suspended" ? "billing" : null, actions: [], triggers: [] };
  }
  const actions: AssayAction[] = [];
  const draftsAllowed = ctx.billing !== "restricted";
  let drafts = ctx.workspaceDraftsToday;
  let drafted = false;
  const roomForTask = ctx.personTasksToday < ctx.caps.tasksPerPersonPerDay && ctx.workspaceTasksToday < ctx.caps.tasksPerWorkspacePerDay;
  if (!roomForTask && triggers.length) {
    actions.push({ kind: "cap", scope: ctx.personTasksToday >= ctx.caps.tasksPerPersonPerDay ? "person" : "workspace_tasks" });
    if (ctx.personTasksToday >= ctx.caps.tasksPerPersonPerDay) {
      actions.push({ kind: "summary", ...summaryNotice(1) });
    }
    return { skipped: null, actions, triggers };
  } else if (triggers.length) {
    const primary = triggers[0];
    const reason = triggers.map((trigger) => because(result, trigger)).join("; ");
    const label = triggers.map((trigger) => TRIGGER_LABEL[trigger]).join(", ");
    actions.push({
      kind: "task",
      trigger: primary,
      taskId: ctx.openTaskId,
      title: taskTitle(ctx.displayName, label, reason),
      because: reason,
      update: Boolean(ctx.openTaskId),
    });
    for (const trigger of triggers) {
      actions.push({
        kind: "notice",
        trigger,
        urgent: URGENT[trigger],
        title: `Assay: ${TRIGGER_LABEL[trigger]}`,
        body: taskTitle(ctx.displayName, TRIGGER_LABEL[trigger], because(result, trigger)),
      });
    }
  }
  for (const trigger of triggers) {
    if (!draftsAllowed) continue;
    const label = TRIGGER_LABEL[trigger];
    if (ctx.activePlaybook) {
      if (ctx.pendingDraft) actions.push({ kind: "boost", trigger, because: label });
      continue;
    }
    if (ctx.pendingDraft || drafted) continue;
    if (drafts >= ctx.caps.draftsPerWorkspacePerDay) {
      actions.push({ kind: "cap", scope: "workspace_drafts" });
      continue;
    }
    actions.push({
      kind: "draft",
      trigger,
      style: trigger === "hot_no_show" ? "reschedule" : "follow_up",
      because: label,
    });
    drafts += 1;
    drafted = true;
  }
  return { skipped: null, actions, triggers };
}

export function groupSummaries(count: number): { title: string; body: string } {
  return summaryNotice(count);
}

export function billingFromState(state: string | null | undefined): BillingGate {
  if (state === "suspended" || state === "canceled") return state === "canceled" ? "closed" : "suspended";
  if (state === "restricted") return "restricted";
  if (state === "closed") return "closed";
  return "ok";
}
