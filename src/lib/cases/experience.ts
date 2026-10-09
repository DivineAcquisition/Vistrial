/** Filters, response clock, and saved views for the lead list. Pure and client-safe. */

export const EXPERIENCE_SORTS = ["urgency", "last_touch", "readiness", "created", "name"] as const;
export type ExperienceSort = (typeof EXPERIENCE_SORTS)[number];

export const RESPONSE_STATES = ["on_time", "at_risk", "missed", "not_applicable"] as const;
export type ResponseState = (typeof RESPONSE_STATES)[number];

export const RESPONSE_LABEL: Record<ResponseState, string> = {
  on_time: "On time",
  at_risk: "At risk",
  missed: "Missed",
  not_applicable: "Not applicable",
};

export const BUILT_IN_VIEWS = [
  { id: "needs_attention", name: "Needs attention" },
  { id: "hot", name: "Hot leads" },
  { id: "waiting", name: "Waiting on a follow-up" },
  { id: "unassigned", name: "Unassigned" },
  { id: "agent_updated", name: "Recently updated by agents" },
  { id: "do_not_contact", name: "Do not contact" },
] as const;

export type BuiltInView = (typeof BUILT_IN_VIEWS)[number]["id"];

export type ExperienceFilter = {
  q: string | null;
  status: string | null;
  source: string | null;
  assignee: string | null;
  response: ResponseState | null;
  band: string | null;
  flagged: boolean;
  needsReview: boolean;
  unresolvedObjection: boolean;
  optOut: boolean;
  createdFrom: string | null;
  createdTo: string | null;
  touchFrom: string | null;
  touchTo: string | null;
  factKey: string | null;
  factValue: string | null;
  view: BuiltInView | null;
  sort: ExperienceSort;
  dir: "asc" | "desc";
  meaning: boolean;
};

export const EMPTY_EXPERIENCE_FILTER: ExperienceFilter = {
  q: null,
  status: null,
  source: null,
  assignee: null,
  response: null,
  band: null,
  flagged: false,
  needsReview: false,
  unresolvedObjection: false,
  optOut: false,
  createdFrom: null,
  createdTo: null,
  touchFrom: null,
  touchTo: null,
  factKey: null,
  factValue: null,
  view: null,
  sort: "urgency",
  dir: "desc",
  meaning: false,
};

export type ExperienceRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  score: number | null;
  headline: string | null;
  band: string | null;
  fileStatus: string | null;
  nextStep: string | null;
  personAction: string | null;
  responseState: ResponseState;
  agentOpen: boolean;
  hasObjection: boolean;
  optedOut: boolean;
  doNotContact: boolean;
  lastTouchAt: string | null;
  lastTouchKind: "human" | "system" | null;
  setterName: string | null;
  closerName: string | null;
  pipelineStage: string | null;
};

export type ListSettings = {
  windowMinutes: number;
  timezone: string;
  bands: Array<{ name: string; min_score: number }>;
  facts: Array<{ key: string; label: string }>;
};

/** Same rules as load_case_experience. */
export function responseState(input: {
  doNotContact: boolean;
  optedOut: boolean;
  status: string;
  optedInAt: string;
  firstHumanTouchAt: string | null;
  now: string;
  windowMinutes: number;
}): ResponseState {
  if (input.doNotContact || input.optedOut || input.status === "closed_won" || input.status === "closed_lost") {
    return "not_applicable";
  }
  const arrived = Date.parse(input.optedInAt);
  const now = Date.parse(input.now);
  const windowMs = input.windowMinutes * 60_000;
  if (input.firstHumanTouchAt) {
    return Date.parse(input.firstHumanTouchAt) <= arrived + windowMs ? "on_time" : "missed";
  }
  const elapsed = now - arrived;
  if (elapsed >= windowMs) return "missed";
  if (elapsed >= Math.max(windowMs * 0.7, 60_000)) return "at_risk";
  return "on_time";
}

export function headlineOf(summary: string | null): string | null {
  if (!summary) return null;
  const line = summary.split(/(?<=[.!?])\s/)[0]?.trim() ?? summary.trim();
  if (!line) return null;
  return line.length > 110 ? `${line.slice(0, 109)}…` : line;
}

function one(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function day(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function parseExperienceFilter(params: Record<string, string | string[] | undefined>): ExperienceFilter {
  const sort = one(params.sort);
  const dir = one(params.dir);
  const response = one(params.response);
  const view = one(params.view);
  return {
    q: one(params.q),
    status: one(params.status),
    source: one(params.source),
    assignee: one(params.assignee),
    response: RESPONSE_STATES.includes(response as ResponseState) ? (response as ResponseState) : null,
    band: one(params.band),
    flagged: one(params.flagged) === "1",
    needsReview: one(params.review) === "1",
    unresolvedObjection: one(params.objection) === "1",
    optOut: one(params.optout) === "1",
    createdFrom: day(one(params.createdFrom)),
    createdTo: day(one(params.createdTo)),
    touchFrom: day(one(params.touchFrom)),
    touchTo: day(one(params.touchTo)),
    factKey: one(params.fact),
    factValue: one(params.factValue),
    view: BUILT_IN_VIEWS.some((item) => item.id === view) ? (view as BuiltInView) : null,
    sort: EXPERIENCE_SORTS.includes(sort as ExperienceSort) ? (sort as ExperienceSort) : "urgency",
    dir: dir === "asc" ? "asc" : "desc",
    meaning: one(params.meaning) === "1",
  };
}

export function experienceSearchParams(filter: ExperienceFilter, extra?: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | null | boolean) => {
    if (value === true) params.set(key, "1");
    else if (typeof value === "string" && value) params.set(key, value);
  };
  set("q", filter.q);
  set("status", filter.status);
  set("source", filter.source);
  set("assignee", filter.assignee);
  set("response", filter.response);
  set("band", filter.band);
  set("flagged", filter.flagged);
  set("review", filter.needsReview);
  set("objection", filter.unresolvedObjection);
  set("optout", filter.optOut);
  set("createdFrom", filter.createdFrom);
  set("createdTo", filter.createdTo);
  set("touchFrom", filter.touchFrom);
  set("touchTo", filter.touchTo);
  set("fact", filter.factKey);
  set("factValue", filter.factValue);
  set("view", filter.view);
  if (filter.sort !== "urgency") params.set("sort", filter.sort);
  if (filter.dir !== "desc") params.set("dir", filter.dir);
  if (filter.meaning) params.set("meaning", "1");
  for (const [key, value] of Object.entries(extra ?? {})) if (value) params.set(key, value);
  return params;
}

export function activeChips(filter: ExperienceFilter, facts: Array<{ key: string; label: string }>): Array<{ key: string; label: string }> {
  const chips: Array<{ key: string; label: string }> = [];
  const view = BUILT_IN_VIEWS.find((item) => item.id === filter.view);
  if (view) chips.push({ key: "view", label: view.name });
  if (filter.q) chips.push({ key: "q", label: filter.meaning ? `Meaning: ${filter.q}` : filter.q });
  if (filter.status) chips.push({ key: "status", label: filter.status.replaceAll("_", " ") });
  if (filter.source) chips.push({ key: "source", label: filter.source });
  if (filter.assignee) chips.push({ key: "assignee", label: filter.assignee === "unassigned" ? "Unassigned" : "Assigned" });
  if (filter.response) chips.push({ key: "response", label: RESPONSE_LABEL[filter.response] });
  if (filter.band) chips.push({ key: "band", label: filter.band === "unscored" ? "Not yet scored" : filter.band });
  if (filter.flagged) chips.push({ key: "flagged", label: "Agent flagged" });
  if (filter.needsReview) chips.push({ key: "review", label: "Needs review" });
  if (filter.unresolvedObjection) chips.push({ key: "objection", label: "Unresolved objection" });
  if (filter.optOut) chips.push({ key: "optout", label: "Do not contact" });
  if (filter.factKey) {
    const label = facts.find((fact) => fact.key === filter.factKey)?.label ?? filter.factKey;
    chips.push({ key: "fact", label: filter.factValue ? `${label}: ${filter.factValue}` : label });
  }
  return chips;
}

export function clearChip(filter: ExperienceFilter, key: string): ExperienceFilter {
  const next = { ...filter };
  if (key === "view") next.view = null;
  if (key === "q") next.q = null;
  if (key === "status") next.status = null;
  if (key === "source") next.source = null;
  if (key === "assignee") next.assignee = null;
  if (key === "response") next.response = null;
  if (key === "band") next.band = null;
  if (key === "flagged") next.flagged = false;
  if (key === "review") next.needsReview = false;
  if (key === "objection") next.unresolvedObjection = false;
  if (key === "optout") next.optOut = false;
  if (key === "fact") {
    next.factKey = null;
    next.factValue = null;
  }
  return next;
}

export function toRpcFilter(filter: ExperienceFilter, windowMinutes: number, memberId: string, offset: number): Record<string, unknown> {
  return {
    q: filter.meaning ? null : filter.q,
    status: filter.status,
    source: filter.source,
    assignee: filter.assignee,
    memberId,
    response: filter.response,
    band: filter.band,
    flagged: filter.flagged,
    needsReview: filter.needsReview,
    unresolvedObjection: filter.unresolvedObjection,
    optOut: filter.optOut,
    createdFrom: filter.createdFrom,
    createdTo: filter.createdTo,
    touchFrom: filter.touchFrom,
    touchTo: filter.touchTo,
    factKey: filter.factKey,
    factValue: filter.factValue,
    view: filter.view,
    sort: filter.sort,
    dir: filter.dir,
    windowMinutes,
    offset,
  };
}

export function mapExperienceRow(raw: Record<string, unknown>): ExperienceRow {
  const response = String(raw.response_state ?? "not_applicable");
  const kind = raw.last_touch_kind === "human" || raw.last_touch_kind === "system" ? raw.last_touch_kind : null;
  return {
    id: String(raw.id),
    name: String(raw.name ?? "Unnamed lead"),
    email: (raw.email as string | null) ?? null,
    phone: (raw.phone as string | null) ?? null,
    source: (raw.source as string | null) ?? null,
    status: String(raw.status ?? "new"),
    score: raw.score == null ? null : Number(raw.score),
    headline: headlineOf((raw.headline as string | null) ?? null),
    band: (raw.band as string | null) ?? null,
    fileStatus: (raw.file_status as string | null) ?? null,
    nextStep: (raw.person_action as string | null) ?? (raw.next_step as string | null) ?? null,
    personAction: (raw.person_action as string | null) ?? null,
    responseState: RESPONSE_STATES.includes(response as ResponseState) ? (response as ResponseState) : "not_applicable",
    agentOpen: raw.agent_open === true,
    hasObjection: raw.has_objection === true,
    optedOut: raw.opted_out === true,
    doNotContact: raw.do_not_contact === true,
    lastTouchAt: (raw.last_touch_at as string | null) ?? null,
    lastTouchKind: kind,
    setterName: (raw.setter_name as string | null) ?? null,
    closerName: (raw.closer_name as string | null) ?? null,
    pipelineStage: (raw.pipeline_stage as string | null) ?? null,
  };
}
