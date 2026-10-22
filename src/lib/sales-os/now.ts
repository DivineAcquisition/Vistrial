/**
 * The Lead Record's "Now" panel: what is true about a lead right now and what
 * changed since this person last looked. Built only from records already
 * loaded for the page, so every line traces back to a row. No message,
 * transcript or note text is quoted here.
 */

export type NowChange = { at: string; label: string };

export type NowInput = {
  stage: string | null;
  lastTouch: { at: string; label: string } | null;
  nextStep: { text: string; dueAt: string | null } | null;
  ownerName: string | null;
  overdueSteps: number;
  openAlerts: number;
  playbookStep: { playbook: string; step: string; dueAt: string | null } | null;
  waitingApprovals: number;
  seenAt: string | null;
  changes: NowChange[];
  now: number;
};

export type NowSummary = {
  lines: string[];
  /** Newest first. Empty when nothing changed since the last look. */
  changed: NowChange[];
  firstLook: boolean;
};

export function relativeTime(iso: string, now: number): string {
  const diff = Date.parse(iso) - now;
  const minutes = Math.round(Math.abs(diff) / 60_000);
  const future = diff > 0;
  let span: string;
  if (minutes < 1) return future ? "now" : "just now";
  if (minutes < 60) span = `${minutes} min`;
  else if (minutes < 60 * 24) span = `${Math.round(minutes / 60)} hr`;
  else span = `${Math.round(minutes / (60 * 24))} days`;
  if (span === "1 days") span = "1 day";
  return future ? `in ${span}` : `${span} ago`;
}

export function stageLabel(stage: string | null): string {
  if (!stage) return "No stage yet";
  return stage.replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
}

export function nowSummary(input: NowInput): NowSummary {
  const lines: string[] = [];
  lines.push(`Stage: ${stageLabel(input.stage)}.`);
  lines.push(input.lastTouch ? `Last: ${input.lastTouch.label}, ${relativeTime(input.lastTouch.at, input.now)}.` : "No one has reached this lead yet.");
  if (input.nextStep) {
    const due = input.nextStep.dueAt ? `, due ${relativeTime(input.nextStep.dueAt, input.now)}` : "";
    const late = input.nextStep.dueAt && Date.parse(input.nextStep.dueAt) < input.now ? " (overdue)" : "";
    lines.push(`Next: ${input.nextStep.text}${due}${late}.`);
  } else if (input.playbookStep) {
    const due = input.playbookStep.dueAt ? `, due ${relativeTime(input.playbookStep.dueAt, input.now)}` : "";
    lines.push(`Next: ${input.playbookStep.step} in ${input.playbookStep.playbook}${due}.`);
  } else {
    lines.push("No next step is set.");
  }
  lines.push(input.ownerName ? `Owned by ${input.ownerName}.` : "No owner yet.");
  if (input.overdueSteps > 0) lines.push(input.overdueSteps === 1 ? "1 step is overdue." : `${input.overdueSteps} steps are overdue.`);
  if (input.openAlerts > 0) lines.push(input.openAlerts === 1 ? "1 alert is open." : `${input.openAlerts} alerts are open.`);
  if (input.waitingApprovals > 0) {
    lines.push(input.waitingApprovals === 1 ? "1 draft is waiting for approval." : `${input.waitingApprovals} drafts are waiting for approval.`);
  }
  const seen = input.seenAt ? Date.parse(input.seenAt) : null;
  const changed = seen === null ? [] : input.changes.filter((change) => Date.parse(change.at) > seen).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { lines, changed, firstLook: seen === null };
}
