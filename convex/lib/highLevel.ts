/**
 * HighLevel (LeadConnector) API v2. Pure helpers for reading: the install address, short error codes,
 * and shaping what HighLevel returns into the little Vistrial keeps. Nothing here writes to HighLevel;
 * the only writes are the approved actions in convex/lib/crmActions.ts.
 * docs/rebuild/crm-highlevel.md explains each choice.
 */

export const HL_API = "https://services.leadconnectorhq.com";

/** What reading needs: the smallest set that covers what the owner asked for. All sub-account scopes. */
export const HL_READ_SCOPES = [
  "locations.readonly",
  "opportunities.readonly",
  "contacts.readonly",
  "conversations.readonly",
  "conversations/message.readonly",
  "calendars.readonly",
  "calendars/events.readonly",
] as const;

/**
 * What the actions built so far need (convex/lib/crmActions.ts): moving and closing deals; tags, notes and
 * tasks on leads; and texting or emailing a lead, behind its own switch. Appointments are not built, so
 * `calendars/events.write` is not asked for.
 */
export const HL_WRITE_SCOPES = ["opportunities.write", "contacts.write", "conversations/message.write"] as const;

export const HL_SCOPES = [...HL_READ_SCOPES, ...HL_WRITE_SCOPES] as const;

/** HighLevel refuses to save a redirect URI that contains "highlevel", so the paths say "hl". */
export const HL_CALLBACK_PATH = "/crm/hl/callback";
export const HL_WEBHOOK_PATH = "/crm/hl/webhook";

/** HighLevel's published Ed25519 key for `X-GHL-Signature` (webhook integration guide). */
export const HL_WEBHOOK_PUBLIC_KEY = "MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=";

const INSTALL_HOSTS = ["marketplace.gohighlevel.com", "marketplace.leadconnectorhq.com"];

/** Most endpoints take this version; conversations and calendars document `2021-04-15`. */
export function apiVersion(path: string) {
  if (path.startsWith("/conversations") || path.startsWith("/calendars")) return "2021-04-15";
  return process.env.HIGHLEVEL_API_VERSION || "2021-07-28";
}

export function isConfigured() {
  return Boolean(process.env.HIGHLEVEL_CLIENT_ID && process.env.HIGHLEVEL_CLIENT_SECRET);
}

export function installUrl(input: { clientId: string; redirectUri: string; state: string }) {
  const wanted = process.env.HIGHLEVEL_INSTALL_HOST ?? "";
  const host = INSTALL_HOSTS.includes(wanted) ? wanted : INSTALL_HOSTS[0];
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: HL_SCOPES.join(" "),
    state: input.state,
  });
  return `https://${host}/oauth/chooselocation?${params}`;
}

/** HighLevel ids are short letters and digits. Anything else is not sent anywhere. */
export function isHlId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{2,64}$/.test(value);
}

/** An API answer as a short code a screen can explain. Never HighLevel's own words, never a token. */
export function hlErrorCode(status: number): string {
  if (status === 401) return "token_rejected";
  if (status === 403) return "permission_missing";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "bad_request";
  if (status >= 500) return "provider_down";
  return "provider_error";
}

/** Codes that end a read at once: retrying around them would only fail again or break HighLevel's limits. */
export function stopsRead(code: string) {
  return code === "rate_limited" || code === "token_rejected" || code === "permission_missing" || code === "connection_failed" || code === "provider_down";
}

/**
 * How long to wait before the next call. HighLevel allows 100 calls per 10 seconds per app per sub-account,
 * in a fixed window with no Retry-After; `X-RateLimit-Remaining` says what is left.
 */
export function pauseAfter(headers: { get(name: string): string | null } | null, gapMs = 150) {
  const raw = headers?.get("x-ratelimit-remaining") ?? null;
  return raw !== null && raw !== "" && Number(raw) < 10 ? 10_000 : gapMs;
}

/** HighLevel sends times as ISO strings, millisecond numbers, or millisecond numbers in strings. */
export function parseTime(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !value) return null;
  if (/^\d{10,14}$/.test(value)) return Number(value);
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function text(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function num(value: unknown) {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null);
const asRows = (value: unknown): Row[] => (Array.isArray(value) ? value.map(asRow).filter((row): row is Row => row !== null) : []);

// ---------- Location ----------

export type Location = { id: string; name: string; timezone: string | null; currency: string };

export function parseLocation(body: unknown): Location | null {
  const row = asRow(asRow(body)?.location) ?? asRow(body);
  if (!row || !isHlId(row.id)) return null;
  const currency = text(row.currency, 3) ?? text(asRow(row.business)?.currency, 3);
  return { id: row.id, name: text(row.name) ?? "HighLevel sub-account", timezone: text(row.timezone, 60), currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD" };
}

// ---------- Pipelines ----------

export type Pipeline = { externalId: string; name: string; stages: { id: string; name: string; position: number }[] };

export function parsePipelines(body: unknown): Pipeline[] {
  return asRows(asRow(body)?.pipelines)
    .filter((row) => isHlId(row.id))
    .slice(0, 50)
    .map((row) => ({
      externalId: row.id as string,
      name: text(row.name) ?? "Pipeline",
      stages: asRows(row.stages)
        .filter((stage) => isHlId(stage.id))
        .slice(0, 60)
        .map((stage, index) => ({ id: stage.id as string, name: text(stage.name, 120) ?? `Stage ${index + 1}`, position: typeof stage.position === "number" ? stage.position : index }))
        .sort((a, b) => a.position - b.position),
    }));
}

// ---------- Deals (opportunities) ----------

export const DEAL_STATUSES = ["open", "won", "lost", "abandoned"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

/** What is kept of an opportunity. Not its name (usually the lead's name), notes, tasks or custom fields. */
export type Deal = {
  externalId: string;
  pipelineId: string;
  stageId: string;
  status: DealStatus;
  value: number;
  source: string | null;
  contactId: string | null;
  assignedTo: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  lastStageChangeAt: number | null;
  lastStatusChangeAt: number | null;
};

/** The contact HighLevel embeds in an opportunity: name, email, phone and tags only. */
export type DealContact = { externalId: string; name: string | null; email: string | null; phone: string | null; tags: string[] };

export function parseDeal(raw: unknown): { deal: Deal; contact: DealContact | null } | null {
  const row = asRow(raw);
  if (!row || !isHlId(row.id) || !isHlId(row.pipelineId) || !isHlId(row.pipelineStageId)) return null;
  const status = (DEAL_STATUSES as readonly string[]).includes(String(row.status)) ? (row.status as DealStatus) : "open";
  const embedded = asRow(row.contact);
  const contactId = isHlId(row.contactId) ? row.contactId : isHlId(embedded?.id) ? (embedded!.id as string) : null;
  return {
    deal: {
      externalId: row.id,
      pipelineId: row.pipelineId,
      stageId: row.pipelineStageId,
      status,
      value: Math.max(0, num(row.monetaryValue)),
      source: text(row.source, 120),
      contactId,
      assignedTo: isHlId(row.assignedTo) ? row.assignedTo : null,
      createdAt: parseTime(row.createdAt),
      updatedAt: parseTime(row.updatedAt),
      lastStageChangeAt: parseTime(row.lastStageChangeAt),
      lastStatusChangeAt: parseTime(row.lastStatusChangeAt),
    },
    contact:
      embedded && contactId
        ? { externalId: contactId, name: text(embedded.name), email: email(embedded.email), phone: text(embedded.phone, 40), tags: tags(embedded.tags) }
        : null,
  };
}

/** Kept: every open deal, and others touched in the last year. */
export function keepDeal(deal: Deal, now: number) {
  if (deal.status === "open") return true;
  const touched = Math.max(deal.updatedAt ?? 0, deal.lastStatusChangeAt ?? 0, deal.createdAt ?? 0);
  return now - touched <= 365 * 86_400_000;
}

// ---------- Contacts ----------

/** What is kept of a lead: name, email, phone, source, a few tags and when they were added. Nothing else. */
export type Contact = {
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  tags: string[];
  addedAt: number | null;
};

function email(value: unknown) {
  const row = text(value, 200);
  return row && /^[^\s@]+@[^\s@]+$/.test(row) ? row.toLowerCase() : null;
}

function tags(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((tag) => text(tag, 60))
    .filter((tag): tag is string => tag !== null)
    .slice(0, 10);
}

export function parseContact(raw: unknown): Contact | null {
  const row = asRow(raw);
  if (!row || !isHlId(row.id)) return null;
  const joined = [text(row.firstName, 80), text(row.lastName, 80)].filter(Boolean).join(" ");
  return {
    externalId: row.id,
    name: text(row.contactName) ?? (joined || null),
    email: email(row.email),
    phone: text(row.phone, 40),
    source: text(row.source, 120),
    tags: tags(row.tags),
    addedAt: parseTime(row.dateAdded),
  };
}

// ---------- Activity ----------

export const ACTIVITY_KINDS = ["call", "sms", "email", "chat", "social", "appointment", "stage_change", "status_change"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * One thing that happened to a lead. Facts only: never a message body, subject, recording, transcript or
 * attachment. `detail` holds a short machine value (a call status, an appointment status, a stage id).
 */
export type Activity = {
  externalId: string;
  kind: ActivityKind;
  direction: "inbound" | "outbound" | null;
  at: number;
  contactId: string | null;
  dealId: string | null;
  status: string | null;
  seconds: number | null;
  fromStage: string | null;
  toStage: string | null;
};

const MESSAGE_KIND: Record<string, ActivityKind> = {
  TYPE_CALL: "call",
  TYPE_CAMPAIGN_CALL: "call",
  TYPE_CAMPAIGN_MANUAL_CALL: "call",
  TYPE_CAMPAIGN_VOICEMAIL: "call",
  TYPE_IVR_CALL: "call",
  TYPE_CUSTOM_CALL: "call",
  TYPE_SMS: "sms",
  TYPE_RCS: "sms",
  TYPE_CAMPAIGN_SMS: "sms",
  TYPE_CAMPAIGN_MANUAL_SMS: "sms",
  TYPE_CUSTOM_SMS: "sms",
  TYPE_CUSTOM_PROVIDER_SMS: "sms",
  TYPE_SMS_NO_SHOW_REQUEST: "sms",
  TYPE_EMAIL: "email",
  TYPE_CAMPAIGN_EMAIL: "email",
  TYPE_CUSTOM_EMAIL: "email",
  TYPE_CUSTOM_PROVIDER_EMAIL: "email",
  TYPE_WEBCHAT: "chat",
  TYPE_LIVE_CHAT: "chat",
  TYPE_WHATSAPP: "chat",
  TYPE_FACEBOOK: "social",
  TYPE_CAMPAIGN_FACEBOOK: "social",
  TYPE_INSTAGRAM: "social",
  TYPE_GMB: "social",
  TYPE_TIKTOK: "social",
};

/** The messages list, whether HighLevel nests it (`messages.messages`) or not. */
export function messagesOf(body: unknown): { rows: Row[]; next: string | null } {
  const outer = asRow(body);
  const inner = asRow(outer?.messages);
  const rows = inner ? asRows(inner.messages) : asRows(outer?.messages);
  const holder = inner ?? outer;
  const next = holder?.nextPage === true && isHlId(holder.lastMessageId) ? (holder.lastMessageId as string) : null;
  return { rows, next };
}

export function parseMessage(raw: unknown): Activity | null {
  const row = asRow(raw);
  if (!row || !isHlId(row.id)) return null;
  const kind = MESSAGE_KIND[String(row.messageType)];
  const at = parseTime(row.dateAdded);
  if (!kind || at === null) return null;
  const meta = asRow(row.meta);
  const call = asRow(meta?.call) ?? meta;
  const seconds = kind === "call" ? num(call?.duration ?? call?.callDuration) || null : null;
  const callStatus = kind === "call" ? text(call?.status ?? call?.callStatus, 30) : null;
  return {
    externalId: row.id,
    kind,
    direction: row.direction === "inbound" || row.direction === "outbound" ? row.direction : null,
    at,
    contactId: isHlId(row.contactId) ? row.contactId : null,
    dealId: null,
    status: callStatus ?? text(row.status, 30),
    seconds,
    fromStage: null,
    toStage: null,
  };
}

export function parseEvent(raw: unknown): Activity | null {
  const row = asRow(raw);
  if (!row || !isHlId(row.id)) return null;
  const at = parseTime(row.startTime);
  if (at === null) return null;
  return {
    externalId: row.id,
    kind: "appointment",
    direction: null,
    at,
    contactId: isHlId(row.contactId) ? row.contactId : null,
    dealId: null,
    status: text(row.appointmentStatus ?? row.status, 30),
    seconds: null,
    fromStage: null,
    toStage: null,
  };
}

/**
 * Stage and status changes, found by comparing this read with the last one. HighLevel has no history
 * endpoint; `lastStageChangeAt` dates the move. A deal seen for the first time is not a change.
 */
export function changesSince(previous: Map<string, { stageId: string; status: string }>, deals: Deal[], now: number): Activity[] {
  const out: Activity[] = [];
  for (const deal of deals) {
    const before = previous.get(deal.externalId);
    if (!before) continue;
    if (before.stageId !== deal.stageId) {
      const at = deal.lastStageChangeAt ?? deal.updatedAt ?? now;
      out.push({ externalId: `stage:${deal.externalId}:${at}`, kind: "stage_change", direction: null, at, contactId: deal.contactId, dealId: deal.externalId, status: null, seconds: null, fromStage: before.stageId, toStage: deal.stageId });
    }
    if (before.status !== deal.status) {
      const at = deal.lastStatusChangeAt ?? deal.updatedAt ?? now;
      out.push({ externalId: `status:${deal.externalId}:${at}`, kind: "status_change", direction: null, at, contactId: deal.contactId, dealId: deal.externalId, status: deal.status, seconds: null, fromStage: null, toStage: null });
    }
  }
  return out;
}

// ---------- Summary ----------

export type Summary = {
  currency: string;
  pipelines: { id: string; name: string; stages: { id: string; name: string; open: number; value: number }[] }[];
  open: { count: number; value: number };
  won: { d30: { count: number; value: number }; d90: { count: number; value: number }; d365: { count: number; value: number } };
  lost90: number;
  winRate90: number | null;
  sources: { source: string; leads: number; won: number; value: number }[];
  activity30: { calls: number; messages: number; appointments: number; stageChanges: number; inbound: number; outbound: number };
  /** Appointments booked for the next 30 days. */
  upcoming: number;
  leads30: number;
  counts: { deals: number; contacts: number; activities: number };
};

const DAY = 86_400_000;

/** What the card shows and Dealmaker starts from, computed in code from what was read. */
export function summarize(input: { currency: string; pipelines: Pipeline[]; deals: Deal[]; contacts: Contact[]; activities: Activity[]; now: number }): Summary {
  const { deals, contacts, activities, now } = input;
  const closedAt = (deal: Deal) => deal.lastStatusChangeAt ?? deal.updatedAt ?? deal.createdAt ?? 0;
  const wonWithin = (days: number) => {
    const rows = deals.filter((deal) => deal.status === "won" && now - closedAt(deal) <= days * DAY);
    return { count: rows.length, value: rows.reduce((sum, deal) => sum + deal.value, 0) };
  };
  const lost90 = deals.filter((deal) => (deal.status === "lost" || deal.status === "abandoned") && now - closedAt(deal) <= 90 * DAY).length;
  const won90 = wonWithin(90);

  const pipelines = input.pipelines.map((pipeline) => ({
    id: pipeline.externalId,
    name: pipeline.name,
    stages: pipeline.stages.map((stage) => {
      const open = deals.filter((deal) => deal.status === "open" && deal.pipelineId === pipeline.externalId && deal.stageId === stage.id);
      return { id: stage.id, name: stage.name, open: open.length, value: open.reduce((sum, deal) => sum + deal.value, 0) };
    }),
  }));

  const contactSource = new Map(contacts.map((contact) => [contact.externalId, contact.source]));
  const bySource = new Map<string, { leads: number; won: number; value: number }>();
  const bump = (source: string | null, field: "leads" | "won", value = 0) => {
    const key = source ?? "Unknown";
    const row = bySource.get(key) ?? { leads: 0, won: 0, value: 0 };
    row[field] += 1;
    row.value += value;
    bySource.set(key, row);
  };
  for (const contact of contacts) if (contact.addedAt !== null && now - contact.addedAt <= 90 * DAY) bump(contact.source, "leads");
  for (const deal of deals) {
    if (deal.status === "won" && now - closedAt(deal) <= 90 * DAY) bump(deal.source ?? (deal.contactId ? contactSource.get(deal.contactId) ?? null : null), "won", deal.value);
  }

  const recent = activities.filter((row) => now - row.at <= 30 * DAY && row.at <= now);
  const open = deals.filter((deal) => deal.status === "open");
  return {
    currency: input.currency,
    pipelines,
    open: { count: open.length, value: open.reduce((sum, deal) => sum + deal.value, 0) },
    won: { d30: wonWithin(30), d90: won90, d365: wonWithin(365) },
    lost90,
    winRate90: won90.count + lost90 > 0 ? won90.count / (won90.count + lost90) : null,
    sources: [...bySource.entries()]
      .map(([source, row]) => ({ source, ...row }))
      .sort((a, b) => b.leads + b.won - (a.leads + a.won))
      .slice(0, 8),
    activity30: {
      calls: recent.filter((row) => row.kind === "call").length,
      messages: recent.filter((row) => row.kind === "sms" || row.kind === "email" || row.kind === "chat" || row.kind === "social").length,
      appointments: recent.filter((row) => row.kind === "appointment").length,
      stageChanges: recent.filter((row) => row.kind === "stage_change").length,
      inbound: recent.filter((row) => row.direction === "inbound").length,
      outbound: recent.filter((row) => row.direction === "outbound").length,
    },
    upcoming: activities.filter((row) => row.kind === "appointment" && row.at > now && row.at - now <= 30 * DAY).length,
    leads30: contacts.filter((contact) => contact.addedAt !== null && now - contact.addedAt <= 30 * DAY).length,
    counts: { deals: deals.length, contacts: contacts.length, activities: activities.length },
  };
}

/** The steps of one read, in order. Screens name them; the server only uses the keys. */
export const HL_STEPS = ["access", "pipelines", "deals", "contacts", "activity", "appointments", "save"] as const;
export type HlStepKey = (typeof HL_STEPS)[number];

/** Limits per read, so one read stays far inside HighLevel's 200,000 calls a day. */
export const HL_LIMITS = { callsPerRead: 400, dealPages: 20, contactPages: 20, conversations: 100, messagesPerConversation: 20, calendars: 10 } as const;

/** Retention, in days. */
export const HL_KEEP = { activityDays: 90, contactDays: 90, conversationDays: 30, reconnectDays: 30, callDays: 30 } as const;

// ---------- Webhook signatures ----------

function fromBase64(value: string) {
  const clean = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
}

/**
 * Checks `X-GHL-Signature` (Ed25519 over the body) with HighLevel's public key. HighLevel's own sample signs
 * `JSON.stringify(body)`, so both the raw body and that form are tried. False on anything unexpected,
 * including a runtime without Ed25519: an unverified delivery is never acted on.
 */
export async function verifyWebhook(rawBody: string, signature: string | null, publicKey = HL_WEBHOOK_PUBLIC_KEY): Promise<boolean> {
  if (!signature || signature.length > 200) return false;
  try {
    const key = await crypto.subtle.importKey("spki", fromBase64(publicKey), { name: "Ed25519" }, false, ["verify"]);
    const sig = fromBase64(signature);
    const forms = [rawBody];
    try {
      forms.push(JSON.stringify(JSON.parse(rawBody)));
    } catch {
      // Not JSON: only the raw form.
    }
    for (const form of forms) {
      if (await crypto.subtle.verify({ name: "Ed25519" }, key, sig, new TextEncoder().encode(form))) return true;
    }
    return false;
  } catch {
    return false;
  }
}
