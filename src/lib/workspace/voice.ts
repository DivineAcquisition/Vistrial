import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";

/**
 * Every sentence the agentic workspace says, in one place. Agents speak in
 * first person, with real numbers, in one or two short sentences. Callers
 * pass structured facts; nothing here invents a figure or reads message text.
 *
 * Rules (tested in voice.test.ts): no em-dashes, no exclamation marks, no
 * technical words (run, step, token, model, queue, job, pipeline, error
 * code, confidence score), no promises about outcomes.
 */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** "99+" past the cap, so badges stay readable. */
export function capCount(n: number, cap = 99): string {
  return n > cap ? `${cap}+` : String(n);
}

function minutesBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.round((toMs - fromMs) / 60_000));
}

/** "12 minutes", "1 hour 5 minutes", "2 days". */
export function spanWords(minutes: number): string {
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return plural(minutes, "minute", "minutes");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${plural(hours, "hour", "hours")} ${plural(rest, "minute", "minutes")}` : plural(hours, "hour", "hours");
  }
  return plural(Math.floor(hours / 24), "day", "days");
}

export function agoWords(iso: string, now: number): string {
  const minutes = minutesBetween(Date.parse(iso), now);
  return minutes < 1 ? "just now" : `${spanWords(minutes)} ago`;
}

export function clockTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

function dayKey(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone });
}

/** "today at 9:02 AM", "yesterday at 6:12 PM", "Monday at 4:00 PM", "Oct 3 at 8:00 AM". */
export function whenWords(iso: string, now: number, timeZone: string): string {
  const at = Date.parse(iso);
  const time = clockTime(iso, timeZone);
  if (dayKey(at, timeZone) === dayKey(now, timeZone)) return `today at ${time}`;
  if (dayKey(at, timeZone) === dayKey(now - 86_400_000, timeZone)) return `yesterday at ${time}`;
  if (now - at < 6 * 86_400_000) {
    return `${new Date(at).toLocaleDateString("en-US", { weekday: "long", timeZone })} at ${time}`;
  }
  return `${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })} at ${time}`;
}

function capitalize(text: string): string {
  return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[.?]$/.test(trimmed) ? capitalize(trimmed) : `${capitalize(trimmed)}.`;
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export const TIER_WORD = { hot: "Hot", warm: "Warm", cool: "Cool", cold: "Cold" } as const;
export type Tier = keyof typeof TIER_WORD;

// ---------------------------------------------------------------------------
// Page title
// ---------------------------------------------------------------------------

export function greeting(input: { firstName: string | null; hour: number }): string {
  const part = input.hour < 12 ? "Good morning" : input.hour < 17 ? "Good afternoon" : "Good evening";
  return input.firstName ? `${part}, ${input.firstName}.` : `${part}.`;
}

/** The line under the business name. Only true counts, and only the ones above zero. */
export function subtitle(input: { firstName: string | null; hour: number; decisions: number | null; dueNow: number }): string {
  const parts: string[] = [];
  if (input.decisions && input.decisions > 0) {
    parts.push(`${plural(input.decisions, "decision is", "decisions are")} waiting`);
  }
  if (input.dueNow > 0) parts.push(`${plural(input.dueNow, "lead needs", "leads need")} a call now`);
  const head = greeting(input);
  if (!parts.length) return `${head} Nothing is waiting on you right now.`;
  return `${head} ${sentence(list(parts))}`;
}

// ---------------------------------------------------------------------------
// Crew band
// ---------------------------------------------------------------------------

export type CrewFacts = {
  sentry: { mode: "off" | "practice" | "live"; watching: number; nextDeadlineAt: string | null };
  scribe: { lastFinishedAt: string | null };
  relay: { waiting: number; readyToSend: number };
  assay: { scoredToday: number; hotToday: number; hotNow: number; paused: boolean };
};

export type CrewPresence = {
  state: "idle" | "working" | "waiting" | "attention" | "paused" | "stopped" | "getting_ready";
  stepLabel: string | null;
  subject: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
  plainError: string | null;
};

export function crewLine(agentId: LiveAgentId, presence: CrewPresence, facts: CrewFacts, now: number, timeZone: string): string {
  if (presence.state === "paused") {
    const by = presence.pausedBy ? ` by ${presence.pausedBy}` : "";
    const at = presence.pausedAt ? ` ${whenWords(presence.pausedAt, now, timeZone)}` : "";
    return `Paused${by}${at}. I am not working until someone resumes me.`;
  }
  if (presence.state === "stopped") {
    return presence.subject
      ? `I stopped while working on ${presence.subject}. Open it to see what happened.`
      : "I stopped. Open my page to see what happened.";
  }
  if (presence.state === "attention") {
    return presence.subject ? `Something on ${presence.subject} needs a look.` : "Something needs a look.";
  }
  if (presence.state === "working" && agentId !== "assay") {
    if (presence.stepLabel) return sentence(presence.stepLabel);
    return presence.subject ? `Working on ${presence.subject}.` : "Starting.";
  }
  switch (agentId) {
    case "sentry": {
      const { mode, watching, nextDeadlineAt } = facts.sentry;
      if (mode === "off") return "Not watching yet. I start when your workspace goes live.";
      if (watching === 0) return "No lead is waiting on a reply right now.";
      const head = `Watching ${plural(watching, "lead", "leads")}.`;
      const next =
        nextDeadlineAt && Date.parse(nextDeadlineAt) > now
          ? ` Next reply window ends in ${spanWords(minutesBetween(now, Date.parse(nextDeadlineAt)))}.`
          : "";
      const practice = mode === "practice" ? " I am practicing, so I do not alert anyone yet." : "";
      return `${head}${next}${practice}`;
    }
    case "scribe":
      return facts.scribe.lastFinishedAt
        ? `Last call processed ${agoWords(facts.scribe.lastFinishedAt, now)}.`
        : "Waiting for your first call.";
    case "relay": {
      const { waiting, readyToSend } = facts.relay;
      if (waiting > 0) return `${plural(waiting, "draft", "drafts")} ready for you.`;
      if (readyToSend > 0) return `${plural(readyToSend, "approved draft is", "approved drafts are")} ready to send from your CRM.`;
      return "No drafts waiting.";
    }
    case "assay": {
      const { scoredToday, hotToday, hotNow, paused } = facts.assay;
      if (paused) return "Paused. I am not scoring leads until someone resumes me.";
      if (scoredToday > 0) {
        const head = `Scored ${plural(scoredToday, "lead", "leads")} today.`;
        return hotToday > 0 ? `${head} ${plural(hotToday, "is", "are")} Hot.` : head;
      }
      return hotNow > 0 ? `${plural(hotNow, "lead is", "leads are")} Hot right now.` : "No new leads to score today.";
    }
    case "compass":
      return "Ready. Ask me anything about your leads.";
  }
}

/** The compact state word on phones. Always a word, never only a color. */
export function crewStateWord(state: CrewPresence["state"]): string {
  return {
    idle: "Idle",
    working: "Working",
    waiting: "Waiting on you",
    attention: "Needs attention",
    paused: "Paused",
    stopped: "Stopped",
    getting_ready: "Getting ready",
  }[state];
}

export function operatorAgentLine(suggestions: number): string {
  return suggestions > 0
    ? `Your agents are working. ${plural(suggestions, "suggestion", "suggestions")} for your leads.`
    : "Your agents are working. Nothing is waiting on you.";
}

// ---------------------------------------------------------------------------
// Trust line and autonomy page
// ---------------------------------------------------------------------------

export function trustLine(autoRunLabels: string[]): string {
  if (!autoRunLabels.length) return "Nothing is sent to a lead without your approval.";
  return `${capitalize(list(autoRunLabels))} can go out without approval. Everything else waits for you.`;
}

export type AutonomyRow = { agentId: LiveAgentId; automatic: string[]; suggests: string[]; never: string[] };

export function autonomyRows(input: {
  sentryMode: "off" | "practice" | "live";
  agentTasks: "suggested" | "direct";
}): AutonomyRow[] {
  const tasks = input.agentTasks === "direct" ? "Adds tasks straight to your list" : "Suggests tasks you accept or dismiss";
  return [
    {
      agentId: "scribe",
      automatic: ["Builds and updates case files from your calls"],
      suggests: ["Asks you when it is unsure of a fact"],
      never: ["Contacts a lead", "Changes your CRM"],
    },
    {
      agentId: "sentry",
      automatic:
        input.sentryMode === "live"
          ? ["Watches reply windows on new leads", "Alerts your team when a lead waits too long"]
          : input.sentryMode === "practice"
            ? ["Watches reply windows on new leads without alerting anyone yet"]
            : ["Nothing yet. It starts when your workspace goes live"],
      suggests: [tasks],
      never: ["Sends anything to a lead", "Chases leads from before you connected"],
    },
    {
      agentId: "relay",
      automatic: ["Drafts follow-ups after calls and missed reply windows"],
      suggests: ["Every draft waits under Decisions waiting"],
      never: ["Sends a message. You approve each draft and send it from your CRM"],
    },
    {
      agentId: "compass",
      automatic: ["Answers questions from records you can open"],
      suggests: ["Drafts, tasks, and case file refreshes, only after you confirm"],
      never: ["Sends a message", "Changes anything without your tap"],
    },
    {
      agentId: "assay",
      automatic: ["Scores leads and puts your list in order"],
      suggests: ["Who to work next, with the reasons"],
      never: ["Contacts a lead", "Alerts you about past leads. They are scored quietly"],
    },
  ];
}

export function gateModeWords(mode: string): string {
  if (mode === "auto_run") return "Runs on its own";
  if (mode === "off") return "Off";
  return "Waits for approval";
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export function decisionUrgency(input: { windowEndsAt: string | null; createdAt: string; now: number }): string {
  if (input.windowEndsAt) {
    const end = Date.parse(input.windowEndsAt);
    if (end > input.now) return `Window ends in ${spanWords(minutesBetween(input.now, end))}`;
    return `Window passed ${spanWords(minutesBetween(end, input.now))} ago`;
  }
  return `Waiting ${spanWords(minutesBetween(Date.parse(input.createdAt), input.now))}`;
}

export type ChecksInput =
  | { kind: "blocked"; reason: "opted_out" | "do_not_contact" | "email_suppressed" | "missing_disclosure" | "config_incomplete" | "sender_not_ready" }
  | { kind: "quiet"; resumeAt: string; leadName: string | null; timeZone: string }
  | { kind: "limit"; resumeAt: string; timeZone: string }
  | { kind: "clear" }
  | { kind: "unknown" };

const BLOCK_WORDS: Record<Extract<ChecksInput, { kind: "blocked" }>["reason"], string> = {
  opted_out: "This lead opted out, so this cannot be sent.",
  do_not_contact: "This lead is marked do not contact, so this cannot be sent.",
  email_suppressed: "Email to this lead bounced or was reported, so this email cannot be sent.",
  missing_disclosure: "A required disclosure is missing. Edit the draft before approving.",
  config_incomplete: "Messaging setup is not finished, so this cannot be sent yet.",
  sender_not_ready: "Your sending number is not approved yet, so this cannot be sent yet.",
};

/** Relay drafts are sent by a person from the CRM, so the checks run again at that moment. */
export function checksLine(input: ChecksInput): string {
  switch (input.kind) {
    case "blocked":
      return BLOCK_WORDS[input.reason];
    case "quiet":
      return `Quiet hours apply now. Send it after ${clockTime(input.resumeAt, input.timeZone)}${input.leadName ? `, when quiet hours end for ${input.leadName}` : ""}. Vistrial checks again when you mark it sent.`;
    case "limit":
      return `This lead has had the most messages your limits allow for now. Send it after ${new Date(input.resumeAt).toLocaleDateString("en-US", { weekday: "long", timeZone: input.timeZone })} at ${clockTime(input.resumeAt, input.timeZone)}. Vistrial checks again when you mark it sent.`;
    case "clear":
      return "Can be sent now. Quiet hours do not apply. Vistrial checks again when you mark it sent.";
    case "unknown":
      return "Vistrial checks again when you mark it sent.";
  }
}

export const DECISION_COPY = {
  heading: "Decisions waiting",
  reviewNext: "Review next",
  done: "Done",
  counter: (index: number, total: number) => `${index} of ${total}`,
  waiting: (count: number) => `${plural(count, "decision is", "decisions are")} waiting.`,
  readOnly: (count: number) =>
    `${plural(count, "decision is", "decisions are")} waiting. Ask the Owner to approve, or ask for approval permission.`,
  allClear: (lastDecisionAt: string | null, now: number, timeZone: string) =>
    lastDecisionAt ? `Nothing is waiting on you. Your last decision was ${whenWords(lastDecisionAt, now, timeZone)}.` : "Nothing is waiting on you.",
  groupHeading: (reason: string, count: number) => `${sentence(reason).replace(/\.$/, "")} (${count})`,
  reconnect: (connector: string) => `${connector} needs reconnecting. Until then, new activity from it does not reach your agents.`,
  suggestedTask: "Suggested task",
  expired: "Expired, not sent.",
  approvedNote: "Approved. Ready to send from your CRM.",
  sentNote: (iso: string, timeZone: string) => `Marked sent at ${clockTime(iso, timeZone)}.`,
} as const;

// ---------------------------------------------------------------------------
// Due now and work next
// ---------------------------------------------------------------------------

export function dueLabel(input: { kind: "first_touch" | "follow_up"; state: "missed" | "at_risk"; deadlineAt: string | null; now: number }): string {
  const what = input.kind === "first_touch" ? "First reply" : "Follow-up";
  if (!input.deadlineAt) return input.state === "missed" ? `${what} is late` : `${what} is due soon`;
  const end = Date.parse(input.deadlineAt);
  if (end <= input.now) return `${what} late by ${spanWords(minutesBetween(end, input.now))}`;
  return `${what} due in ${spanWords(minutesBetween(input.now, end))}`;
}

export const WORK_COPY = {
  dueHeading: "Due now",
  nextHeading: "Work next",
  tasksHeading: "Your tasks",
  best: "Best first",
  oldest: "Oldest first",
  mine: "Mine",
  everyone: "Everyone",
  seeAll: "See all",
  newItems: (count: number) => `${plural(count, "new item", "new items")} available`,
  whyFirst: "Why first?",
  empty: "No leads to work right now. New leads appear here as they come in.",
  learning: "Using industry defaults. Scoring by lead source starts once a source has 20 closed deals.",
  textDraftConfirm: "Ask Relay for a draft? It will wait under Decisions waiting. Nothing is sent without approval.",
  textDraftDone: "Relay will prepare a draft. It will wait for approval.",
  snoozed: "Snoozed until tomorrow morning.",
  taskSource: { person: "Yours", sentry: "Sentry", scribe: "Scribe", assay: "Assay", playbook: "Playbook", booking: "Booking", service_team: "Vistrial team" } as Record<string, string>,
} as const;

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------

export type BriefingFacts = {
  sinceAt: string;
  capped: boolean;
  newLeads: number;
  caseFiles: number;
  caseFilesForReview: number;
  sentryCaught: number;
  sentryReached: number;
  sentrySlowestMinutes: number | null;
  relayDrafted: number;
  relayWaiting: number;
  relayApproved: number;
  relaySent: number;
  assayMovedUp: number;
  assayNewlyHot: string[];
  needYouToday: number;
};

export type BriefingLine = { agentId: LiveAgentId; text: string; href: string };
export type Briefing = { headline: string; lines: BriefingLine[]; quiet: boolean };

export function briefingFrom(facts: BriefingFacts, now: number, timeZone: string): Briefing {
  const since = facts.capped ? "In the last 7 days" : `Since ${whenWords(facts.sinceAt, now, timeZone)}`;
  const parts: string[] = [];
  if (facts.newLeads) parts.push(`${plural(facts.newLeads, "new lead", "new leads")} came in`);
  if (facts.caseFiles) parts.push(`${plural(facts.caseFiles, "call was", "calls were")} processed`);
  if (facts.needYouToday) parts.push(`${plural(facts.needYouToday, "lead needs", "leads need")} you today`);

  const lines: BriefingLine[] = [];
  if (facts.caseFiles) {
    const review = facts.caseFilesForReview ? ` ${plural(facts.caseFilesForReview, "needs", "need")} a quick look from you.` : "";
    lines.push({ agentId: "scribe", text: `I built ${plural(facts.caseFiles, "case file", "case files")}.${review}`, href: "/app/cases" });
  }
  if (facts.sentryCaught) {
    const caught = `I caught ${plural(facts.sentryCaught, "lead", "leads")} past the reply window.`;
    let after = "";
    if (facts.sentryReached === facts.sentryCaught) {
      const who = facts.sentryCaught === 1 ? "It was" : facts.sentryCaught === 2 ? "Both were" : "All were";
      after = facts.sentrySlowestMinutes !== null ? ` ${who} reached within ${spanWords(facts.sentrySlowestMinutes)} of my alert.` : ` ${who} reached after my alert.`;
    } else if (facts.sentryReached > 0) {
      after = ` ${plural(facts.sentryReached, "was", "were")} reached after my alert. ${plural(facts.sentryCaught - facts.sentryReached, "still needs", "still need")} a call.`;
    } else {
      after = facts.sentryCaught === 1 ? " It still needs a call." : " They still need a call.";
    }
    lines.push({ agentId: "sentry", text: caught + after, href: "/app/today" });
  }
  if (facts.relayDrafted) {
    const extra: string[] = [];
    if (facts.relayWaiting) extra.push(`${plural(facts.relayWaiting, "is", "are")} waiting for you`);
    if (facts.relayApproved) extra.push(`${plural(facts.relayApproved, "was", "were")} approved`);
    if (facts.relaySent) extra.push(`${plural(facts.relaySent, "was", "were")} marked sent`);
    lines.push({
      agentId: "relay",
      text: `I drafted ${plural(facts.relayDrafted, "follow-up", "follow-ups")}.${extra.length ? ` ${sentence(list(extra))}` : ""}`,
      href: "/app/home#decisions",
    });
  }
  if (facts.assayMovedUp || facts.assayNewlyHot.length) {
    const moved = facts.assayMovedUp ? `${plural(facts.assayMovedUp, "lead", "leads")} moved up.` : "";
    const hot = facts.assayNewlyHot.length
      ? ` ${list(facts.assayNewlyHot.slice(0, 3))}${facts.assayNewlyHot.length > 3 ? ` and ${plural(facts.assayNewlyHot.length - 3, "other", "others")}` : ""} became Hot.`
      : "";
    lines.push({ agentId: "assay", text: `${moved}${hot}`.trim(), href: "/app/queue" });
  }

  if (!parts.length && !lines.length) {
    return { headline: "No new activity since you were last here.", lines: [], quiet: true };
  }
  const headline = parts.length ? `${since}: ${list(parts)}.` : `${since}, here is what your agents did.`;
  return { headline, lines: lines.slice(0, 5), quiet: false };
}

export const BRIEFING_COPY = {
  heading: "While you were away",
  show: "Show briefing",
  hide: "Hide briefing",
  history: "Earlier briefings",
  dayLabel: (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }),
} as const;

// ---------------------------------------------------------------------------
// Outcome strip
// ---------------------------------------------------------------------------

export function contributionLine(input: { caseFiles: number; clocks: number; drafts: number }): string | null {
  const parts: string[] = [];
  if (input.caseFiles) parts.push(`built ${plural(input.caseFiles, "case file", "case files")}`);
  if (input.clocks) parts.push(`watched ${plural(input.clocks, "reply window", "reply windows")}`);
  if (input.drafts) parts.push(`drafted ${plural(input.drafts, "follow-up", "follow-ups")}`);
  return parts.length ? `This week your agents ${list(parts)}.` : null;
}

export const OUTCOME_COPY = {
  heading: "How it is going",
  notEnough: "Not enough data to compare yet.",
  collecting: (days: number) => `Collecting your first numbers. Live for ${plural(days, "day", "days")} so far.`,
  vsLast: "vs last week",
} as const;

// ---------------------------------------------------------------------------
// Live stream
// ---------------------------------------------------------------------------

export type StreamRun = {
  agentId: LiveAgentId;
  status: string;
  subject: string;
  reason: string | null;
  plainError: string | null;
};

export function streamLine(run: StreamRun): string {
  const name = AGENTS[run.agentId].name;
  const subject = run.subject || "a lead";
  switch (run.status) {
    case "queued":
    case "working":
      return `${name} is working on ${subject}.`;
    case "waiting_person":
      return run.agentId === "relay" ? `${name} drafted a follow-up for ${subject}. Waiting for approval.` : `${name} is waiting on you for ${subject}.`;
    case "waiting_provider":
      return `${name} is waiting on an outside service for ${subject}.`;
    case "completed":
      if (run.agentId === "scribe") return `${name} finished ${subject}.`;
      if (run.agentId === "sentry") return run.reason ? `${name} flagged ${subject}: ${run.reason.replace(/\.$/, "")}.` : `${name} checked ${subject}.`;
      if (run.agentId === "relay") return `${name} finished the draft for ${subject}.`;
      if (run.agentId === "compass") return `${name} answered a question.`;
      return `${name} finished ${subject}.`;
    case "expired":
      return `${name}: the request for ${subject} expired, not sent.`;
    case "failed":
    case "stuck":
      return `${name} stopped on ${subject}. It needs a look.`;
    case "needs_person":
      return `${name} needs a person to look at ${subject}.`;
    case "paused":
      return `${name} is paused on ${subject}.`;
    case "stopped":
      return `${name} was stopped on ${subject}.`;
    default:
      return `${name}: ${subject}.`;
  }
}

export function tierMoveLine(input: { name: string; tier: Tier }): string {
  return `Assay moved ${input.name} to ${TIER_WORD[input.tier]}.`;
}

export function burstLine(agentId: LiveAgentId, count: number): string {
  const name = AGENTS[agentId].name;
  if (agentId === "scribe") return `${name} processed ${plural(count, "call", "calls")}.`;
  if (agentId === "sentry") return `${name} checked ${plural(count, "lead", "leads")}.`;
  if (agentId === "relay") return `${name} drafted ${plural(count, "follow-up", "follow-ups")}.`;
  return `${name} finished ${plural(count, "item", "items")}.`;
}

export const STREAM_COPY = {
  heading: "Live",
  pause: "Pause",
  resume: "Resume",
  paused: "Paused while you read.",
  reconnecting: "Reconnecting...",
  lost: "Live updates stopped. Refresh to catch up.",
  newItems: (count: number) => `${plural(count, "new item", "new items")}`,
  viewRun: "See the full record",
  more: "Show earlier",
  empty: "Your agents have not done anything yet today.",
} as const;

// ---------------------------------------------------------------------------
// Command bar
// ---------------------------------------------------------------------------

export type SuggestionFacts = {
  hotUncontacted: number;
  callsYesterday: number;
  waitingOver30: number;
  caseFilesThisMonth: number;
  decisions: number;
  operator: boolean;
};

export function commandSuggestions(facts: SuggestionFacts): string[] {
  const out: string[] = [];
  if (facts.hotUncontacted > 0) out.push(facts.operator ? "Which of my Hot leads have not been contacted?" : "Which Hot leads have not been contacted?");
  if (facts.waitingOver30 > 0) out.push("Show leads waiting more than 30 minutes");
  if (facts.callsYesterday > 0) out.push("What did Scribe learn from yesterday's calls?");
  if (!facts.operator && facts.caseFilesThisMonth >= 10) out.push("What are my top three objections this month?");
  if (facts.decisions > 0) out.push("Which decisions are most urgent?");
  return out.slice(0, 5);
}

export const COMMAND_COPY = {
  placeholder: "Search or ask Vistrial",
  placeholderShort: "Search or ask",
  ask: (q: string) => `Ask Compass: "${q}"`,
  groups: { leads: "Leads", pages: "Pages", tasks: "Tasks", ask: "Ask Compass", suggested: "Try asking" },
  footer: "Compass suggests actions. Nothing happens until you confirm.",
  empty: "No leads or pages match. Press Enter to ask Compass.",
} as const;

// ---------------------------------------------------------------------------
// Lifecycle states
// ---------------------------------------------------------------------------

export type WelcomeFacts = {
  businessName: string;
  callsRead: number;
  caseFiles: number;
  scored: number;
  hotNow: number;
  sentryMode: "off" | "practice" | "live";
  watchFrom: string | null;
  draftsWaiting: number;
  callSourceConnected: boolean;
};

export function welcomeLines(facts: WelcomeFacts, now: number, timeZone: string): Array<{ agentId: LiveAgentId; text: string }> {
  return [
    {
      agentId: "scribe",
      text:
        facts.callsRead || facts.caseFiles
          ? `I read ${plural(facts.callsRead, "past call", "past calls")} and built ${plural(facts.caseFiles, "case file", "case files")}.`
          : facts.callSourceConnected
            ? "Waiting for the first call. I build a case file from each one."
            : "Connect your call source and I will start building case files.",
    },
    {
      agentId: "assay",
      text: facts.scored
        ? `I scored ${plural(facts.scored, "lead", "leads")}. ${plural(facts.hotNow, "is", "are")} Hot right now. Past leads are scored quietly. I will only alert you about new activity.`
        : "Waiting for leads to score. Past leads are scored quietly. I will only alert you about new activity.",
    },
    {
      agentId: "sentry",
      text:
        facts.sentryMode !== "off" && facts.watchFrom
          ? `I am watching new activity from ${whenWords(facts.watchFrom, now, timeZone)}. I will not chase old leads.`
          : "I start watching new activity when your workspace goes live. I will not chase old leads.",
    },
    {
      agentId: "relay",
      text: facts.draftsWaiting
        ? `${plural(facts.draftsWaiting, "draft is", "drafts are")} waiting for you under Decisions waiting. I never send. You approve each one and send it from your CRM.`
        : "No drafts yet. When I have one, it will appear under Decisions waiting. I never send without your approval.",
    },
    { agentId: "compass", text: "Ask me anything about your leads in the bar above." },
  ];
}

export const WELCOME_COPY = {
  title: (business: string) => `Welcome to ${business}'s sales team`,
  intro: "Five agents work alongside you. Here is what they have done so far and what they need from you.",
  meet: "Meet your team",
  moves: "Your first moves",
  go: "Go to my workspace",
  skip: "Skip",
  tour: "Welcome tour",
} as const;

export const STATE_COPY = {
  importing: (imported: number) =>
    imported > 0 ? `Importing your history. ${plural(imported, "contact", "contacts")} brought in so far.` : "Importing your history.",
  importingNote: "Your workspace goes live when the import finishes. You can leave this page.",
  quietWatching: "Your agents are watching. The first events show here as they arrive.",
  attentionMore: (count: number) => (count > 0 ? ` ${plural(count, "other thing needs", "other things need")} a look.` : ""),
  reconnect: (connector: string) => `${connector} lost access. Reconnect to keep your data current.`,
  agentStopped: (agent: string) => `${agent} stopped and needs a look.`,
  dataDelayed: (connector: string) => `Updates from ${connector} are running behind. Some data may be out of date.`,
  staleNote: "Some data may be out of date.",
  workspacePaused: "This workspace is paused, so your agents are not working. Nothing is deleted.",
  sectionError: "This part did not load.",
  retry: "Try again",
  allClear: "All clear. Nothing is waiting on you and nothing is due.",
} as const;
