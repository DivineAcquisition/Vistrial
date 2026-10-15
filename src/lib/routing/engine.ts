/**
 * Pure lead routing. The database applies a decision; this file decides it.
 * A person who is away, outside hours, or at capacity is skipped and is not
 * owed the leads they missed.
 */

export const ASSIGNMENT_MODES = [
  "manual",
  "round_robin",
  "weighted_round_robin",
  "least_loaded",
  "rules",
  "by_source",
  "by_service",
] as const;

export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

export type FallbackMode = "manual" | "round_robin" | "weighted_round_robin" | "least_loaded";

export type RoutingOperator = {
  memberId: string;
  name: string;
  active: boolean;
  away: boolean;
  weight: number;
  openLeads: number;
  overdueTasks: number;
  maxOpenLeads: number | null;
  maxOverdueTasks: number | null;
  inHours: boolean;
  pools: string[];
  /** Leads this person has received in the current rotation. Not a backlog. */
  received: number;
};

export type RoutingRule = {
  id: string;
  enabled: boolean;
  position: number;
  source: string | null;
  service: string | null;
  scoreBand: string | null;
  location: string | null;
  language: string | null;
  targetMemberId: string | null;
  targetPool: string | null;
};

export type RoutingLead = {
  source: string | null;
  service: string | null;
  scoreBand: string | null;
  location: string | null;
  language: string | null;
  previousMemberId: string | null;
  previousAt: string | null;
  assignedMemberId: string | null;
};

export type RoutingInput = {
  mode: AssignmentMode;
  fallbackMode: FallbackMode;
  operators: RoutingOperator[];
  rules: RoutingRule[];
  lead: RoutingLead;
  /** Member who received the previous new lead. The next turn starts after them. */
  cursorMemberId: string | null;
  stickyDays: number;
  respectHours: boolean;
  now: string;
  historic: boolean;
  pool: string | null;
};

export type RoutingSkip = { memberId: string; name: string; reason: string };

export type RoutingDecision = {
  memberId: string | null;
  mode: string;
  explanation: string;
  skipped: RoutingSkip[];
  /** Cursor after this decision. Unchanged when nobody is assigned. */
  cursorMemberId: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function blank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

export function ineligibleReason(person: RoutingOperator, input: Pick<RoutingInput, "respectHours" | "pool">): string | null {
  if (!person.active) return "not active";
  if (person.away) return "away";
  if (input.respectHours && !person.inHours) return "outside working hours";
  if (person.maxOpenLeads != null && person.openLeads >= person.maxOpenLeads) return "at the open-lead limit";
  if (person.maxOverdueTasks != null && person.overdueTasks >= person.maxOverdueTasks) return "at the overdue-task limit";
  if (input.pool && !person.pools.some((pool) => same(pool, input.pool))) return "not in this pool";
  if (person.weight <= 0) return "weight is zero";
  return null;
}

function eligible(input: RoutingInput): RoutingOperator[] {
  return input.operators.filter((person) => ineligibleReason(person, input) == null);
}

function skipped(input: RoutingInput): RoutingSkip[] {
  return input.operators.flatMap((person) => {
    const reason = ineligibleReason(person, input);
    return reason ? [{ memberId: person.memberId, name: person.name, reason }] : [];
  });
}

function startIndex(order: RoutingOperator[], cursor: string | null): number {
  if (!cursor || order.length === 0) return 0;
  const at = order.findIndex((person) => person.memberId === cursor);
  if (at < 0) return 0;
  return (at + 1) % order.length;
}

function assign(input: RoutingInput, person: RoutingOperator, mode: string, explanation: string, extraSkips: RoutingSkip[] = []): RoutingDecision {
  return {
    memberId: person.memberId,
    mode,
    explanation,
    skipped: [...extraSkips, ...skipped(input).filter((row) => row.memberId !== person.memberId)],
    cursorMemberId: person.memberId,
  };
}

function nobody(input: RoutingInput, mode: string, explanation: string): RoutingDecision {
  return {
    memberId: null,
    mode,
    explanation,
    skipped: skipped(input),
    cursorMemberId: input.cursorMemberId,
  };
}

function poolPhrase(input: RoutingInput): string {
  return input.pool ? ` in ${input.pool}` : "";
}

function roundRobin(input: RoutingInput, mode: string): RoutingDecision {
  const order = input.operators;
  if (order.length === 0) {
    return nobody(input, mode, `Nobody is in the rotation${poolPhrase(input)}.`);
  }
  const start = startIndex(order, input.cursorMemberId);
  for (let step = 0; step < order.length; step += 1) {
    const person = order[(start + step) % order.length];
    if (!person) continue;
    if (ineligibleReason(person, input)) continue;
    return assign(
      input,
      person,
      mode,
      `${person.name} is next in the round robin${poolPhrase(input)}. People who are away keep their place and are not given a backlog when they return.`
    );
  }
  return nobody(input, mode, `Everyone${poolPhrase(input)} is away, outside working hours, or at capacity.`);
}

function weighted(input: RoutingInput): RoutingDecision {
  const ready = eligible(input);
  if (ready.length === 0) {
    return nobody(input, "weighted_round_robin", `Everyone${poolPhrase(input)} is away, outside working hours, or at capacity.`);
  }
  const start = startIndex(input.operators, input.cursorMemberId);
  const rank = new Map(input.operators.map((person, index) => [person.memberId, index]));
  const ordered = [...ready].sort((a, b) => {
    const loadA = a.received / Math.max(a.weight, 1);
    const loadB = b.received / Math.max(b.weight, 1);
    if (loadA !== loadB) return loadA - loadB;
    const posA = ((rank.get(a.memberId) ?? 0) - start + input.operators.length) % input.operators.length;
    const posB = ((rank.get(b.memberId) ?? 0) - start + input.operators.length) % input.operators.length;
    return posA - posB;
  });
  const person = ordered[0];
  if (!person) return nobody(input, "weighted_round_robin", "Nobody is eligible.");
  return assign(
    input,
    person,
    "weighted_round_robin",
    `${person.name} receives this lead because their share is the lowest among people who can take one. Weight ${person.weight}.`
  );
}

function leastLoaded(input: RoutingInput): RoutingDecision {
  const ready = eligible(input);
  if (ready.length === 0) {
    return nobody(input, "least_loaded", `Everyone${poolPhrase(input)} is away, outside working hours, or at capacity.`);
  }
  const ordered = [...ready].sort((a, b) => a.openLeads - b.openLeads || a.overdueTasks - b.overdueTasks || a.name.localeCompare(b.name));
  const person = ordered[0];
  if (!person) return nobody(input, "least_loaded", "Nobody is eligible.");
  return assign(
    input,
    person,
    "least_loaded",
    `${person.name} has the fewest open leads (${person.openLeads}) among people who can take one.`
  );
}

function ruleMatches(rule: RoutingRule, lead: RoutingLead, mode: AssignmentMode): boolean {
  if (!rule.enabled) return false;
  if (mode === "by_source" && blank(rule.source)) return false;
  if (mode === "by_service" && blank(rule.service)) return false;
  if (!blank(rule.source) && !same(rule.source, lead.source)) return false;
  if (!blank(rule.service) && !same(rule.service, lead.service)) return false;
  if (!blank(rule.scoreBand) && !same(rule.scoreBand, lead.scoreBand)) return false;
  if (!blank(rule.location) && !same(rule.location, lead.location)) return false;
  if (!blank(rule.language) && !same(rule.language, lead.language)) return false;
  if (mode === "by_source" || mode === "by_service") return true;
  return true;
}

function sticky(input: RoutingInput): RoutingDecision | null {
  if (input.stickyDays <= 0 || !input.lead.previousMemberId || !input.lead.previousAt) return null;
  const age = Date.parse(input.now) - Date.parse(input.lead.previousAt);
  if (!Number.isFinite(age) || age < 0 || age > input.stickyDays * DAY_MS) return null;
  const person = input.operators.find((row) => row.memberId === input.lead.previousMemberId);
  if (!person) return null;
  const reason = ineligibleReason(person, input);
  if (reason) return null;
  return assign(
    input,
    person,
    "sticky",
    `${person.name} worked this lead within the last ${input.stickyDays} days, so it goes back to them.`
  );
}

function byRules(input: RoutingInput): RoutingDecision {
  const rules = [...input.rules].filter((rule) => rule.enabled).sort((a, b) => a.position - b.position);
  for (const rule of rules) {
    if (!ruleMatches(rule, input.lead, input.mode)) continue;
    if (rule.targetMemberId) {
      const person = input.operators.find((row) => row.memberId === rule.targetMemberId);
      if (!person) continue;
      const reason = ineligibleReason(person, { ...input, pool: null });
      if (reason) {
        return nobody(
          { ...input, pool: null },
          input.mode,
          `${person.name} matches the rule but is ${reason}. The lead stays unassigned.`
        );
      }
      return assign({ ...input, pool: null }, person, input.mode, `${person.name} matches the first routing rule.`);
    }
    if (rule.targetPool) {
      const inside: RoutingInput = {
        ...input,
        mode: input.fallbackMode,
        pool: rule.targetPool,
        rules: [],
      };
      const decision = routeLead(inside);
      return {
        ...decision,
        mode: input.mode,
        explanation: decision.memberId
          ? `${decision.explanation} The rule sent it to the ${rule.targetPool} pool.`
          : `The rule sent it to ${rule.targetPool}, and ${decision.explanation}`,
      };
    }
  }
  if (input.mode === "rules") {
    return routeLead({ ...input, mode: input.fallbackMode, rules: [], pool: input.pool });
  }
  return nobody(input, input.mode, "No routing rule matched, so the lead stays unassigned.");
}

export function routeLead(input: RoutingInput): RoutingDecision {
  if (input.historic) {
    return {
      memberId: null,
      mode: "historic",
      explanation: "Imported history is not assigned and does not send a notice.",
      skipped: [],
      cursorMemberId: input.cursorMemberId,
    };
  }
  if (input.lead.assignedMemberId) {
    return {
      memberId: input.lead.assignedMemberId,
      mode: "already_assigned",
      explanation: "This lead already has a person. It was not assigned again.",
      skipped: [],
      cursorMemberId: input.cursorMemberId,
    };
  }
  const back = sticky(input);
  if (back) return back;
  switch (input.mode) {
    case "manual":
      return nobody(input, "manual", "This workspace leaves new leads unassigned until someone claims one.");
    case "round_robin":
      return roundRobin(input, "round_robin");
    case "weighted_round_robin":
      return weighted(input);
    case "least_loaded":
      return leastLoaded(input);
    case "rules":
    case "by_source":
    case "by_service":
      return byRules(input);
    default:
      return nobody(input, "manual", "This workspace leaves new leads unassigned until someone claims one.");
  }
}

/** After time away, rejoin at the current low end so one person does not catch up in a burst. */
export function receivedAfterReturn(person: RoutingOperator, peers: RoutingOperator[]): number {
  const active = peers.filter((row) => row.memberId !== person.memberId && row.active && !row.away);
  if (active.length === 0) return person.received;
  const floor = Math.min(...active.map((row) => row.received));
  return Math.max(person.received, floor);
}

export function arrivalIdempotencyKey(leadId: string): string {
  return `arrival:${leadId}`;
}

export type FairnessStep = { memberId: string | null };

/** Walk a sequence of identical leads, updating the cursor and received counts. */
export function simulateFairness(
  base: RoutingInput,
  count: number,
  awayRanges: Array<{ memberId: string; from: number; to: number }> = []
): FairnessStep[] {
  const operators = base.operators.map((person) => ({ ...person }));
  let cursor = base.cursorMemberId;
  const steps: FairnessStep[] = [];
  for (let i = 0; i < count; i += 1) {
    for (const person of operators) {
      const away = awayRanges.some((range) => range.memberId === person.memberId && i >= range.from && i < range.to);
      const wasAway = person.away;
      person.away = away;
      if (wasAway && !away) person.received = receivedAfterReturn(person, operators);
    }
    const decision = routeLead({
      ...base,
      operators,
      cursorMemberId: cursor,
      lead: { ...base.lead, assignedMemberId: null, previousMemberId: null },
    });
    steps.push({ memberId: decision.memberId });
    if (decision.memberId && decision.mode !== "already_assigned") {
      cursor = decision.cursorMemberId;
      const person = operators.find((row) => row.memberId === decision.memberId);
      if (person) person.received += 1;
    }
  }
  return steps;
}
