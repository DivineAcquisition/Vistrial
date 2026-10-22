import { z } from "zod";

/**
 * The action registry (Prompt 26, Part 6). Agents act only through these
 * named, typed actions: no generic API call, no code, no raw SQL.
 *
 * Tiers:
 * - reaches_person: a lead or client sees it. Always waits for approval in
 *   the existing gate, with send-time rechecks. No policy can change that.
 * - internal_write: a write inside the company's own tools. The Owner sets
 *   each to Suggest (the default, decision 2) or Do and log.
 * - read: search and fetch, within the asking person's visibility.
 */

export type ActionTier = "reaches_person" | "internal_write" | "read";
export type InternalPolicy = "suggest" | "do_and_log";

export type ActionDef<P extends z.ZodType = z.ZodType> = {
  name: string;
  label: string;
  tier: ActionTier;
  /** Connectors that can perform it. */
  connectors: string[];
  params: P;
  /** The vendor lets us put the old value back. */
  reversible: boolean;
  /** Write scopes per connector, asked for only when the Owner turns the action on. */
  writeScopes: Record<string, string[]>;
  /** The approval gate action type that carries it, for reaches_person actions. Null until the gate has one. */
  gateType?: string | null;
};

const leadRef = z.object({ leadId: z.uuid() });
const crmRef = leadRef.extend({ connector: z.enum(["gohighlevel", "hubspot", "salesforce"]) });
const shortText = z.string().trim().min(1).max(2000);

function def<P extends z.ZodType>(entry: ActionDef<P>): ActionDef<P> {
  return entry;
}

export const ACTIONS = [
  def({
    name: "send.email",
    label: "Send an email to a lead",
    tier: "reaches_person",
    connectors: ["gohighlevel", "hubspot", "google_workspace"],
    params: leadRef.extend({ draftId: z.uuid() }),
    reversible: false,
    writeScopes: {},
    gateType: "send_email",
  }),
  def({
    name: "send.text",
    label: "Send a text to a lead",
    tier: "reaches_person",
    connectors: ["gohighlevel"],
    params: leadRef.extend({ draftId: z.uuid() }),
    reversible: false,
    writeScopes: {},
    gateType: "send_text",
  }),
  def({
    name: "send.dm",
    label: "Send a direct message to a lead",
    tier: "reaches_person",
    connectors: ["gohighlevel"],
    params: leadRef.extend({ draftId: z.uuid() }),
    reversible: false,
    writeScopes: {},
    gateType: null,
  }),
  def({
    name: "send.calendar_invite",
    label: "Send a calendar invite to a lead",
    tier: "reaches_person",
    connectors: ["google_workspace"],
    params: leadRef.extend({ draftId: z.uuid() }),
    reversible: false,
    writeScopes: {},
    gateType: null,
  }),
  def({
    name: "crm.update_field",
    label: "Update a CRM field",
    tier: "internal_write",
    connectors: ["gohighlevel", "hubspot"],
    params: crmRef.extend({ field: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), value: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]) }),
    reversible: true,
    writeScopes: { hubspot: ["crm.objects.contacts.write"], gohighlevel: ["contacts.write"] },
  }),
  def({
    name: "crm.move_stage",
    label: "Move a CRM stage",
    tier: "internal_write",
    connectors: ["gohighlevel", "hubspot"],
    params: crmRef.extend({ stage: z.string().trim().min(1).max(120) }),
    reversible: true,
    writeScopes: { hubspot: ["crm.objects.deals.write"], gohighlevel: ["opportunities.write"] },
  }),
  def({
    name: "crm.add_tag",
    label: "Add a CRM tag",
    tier: "internal_write",
    connectors: ["gohighlevel", "hubspot"],
    params: crmRef.extend({ tag: z.string().trim().min(1).max(60) }),
    reversible: true,
    writeScopes: { hubspot: ["crm.objects.contacts.write"], gohighlevel: ["contacts.write"] },
  }),
  def({
    name: "crm.create_task",
    label: "Create a CRM task",
    tier: "internal_write",
    connectors: ["gohighlevel", "hubspot"],
    params: crmRef.extend({ title: z.string().trim().min(1).max(200), dueAt: z.iso.datetime().nullable() }),
    reversible: true,
    writeScopes: { hubspot: ["crm.objects.contacts.write"], gohighlevel: ["contacts.write"] },
  }),
  def({
    name: "crm.add_note",
    label: "Add a CRM note",
    tier: "internal_write",
    connectors: ["gohighlevel", "hubspot"],
    params: crmRef.extend({ body: shortText }),
    reversible: true,
    writeScopes: { hubspot: ["crm.objects.contacts.write"], gohighlevel: ["contacts.write"] },
  }),
  def({
    name: "docs.upsert",
    label: "Create or update a Google Doc",
    tier: "internal_write",
    connectors: ["google_workspace"],
    params: z.object({ docId: z.string().max(200).nullable(), title: z.string().trim().min(1).max(200), body: z.string().max(20000) }),
    reversible: false,
    writeScopes: { google_workspace: ["https://www.googleapis.com/auth/drive.file"] },
  }),
  def({
    name: "sheets.upsert_row",
    label: "Create or update a Sheet row",
    tier: "internal_write",
    connectors: ["google_workspace"],
    params: z.object({ sheetId: z.string().max(200), match: z.record(z.string(), z.string().max(500)), values: z.record(z.string(), z.string().max(500)) }),
    reversible: true,
    writeScopes: { google_workspace: ["https://www.googleapis.com/auth/drive.file"] },
  }),
  def({
    name: "airtable.upsert_record",
    label: "Create or update an Airtable record",
    tier: "internal_write",
    connectors: ["airtable"],
    params: z.object({ baseId: z.string().regex(/^app[A-Za-z0-9]{3,30}$/), table: z.string().max(100), recordId: z.string().max(40).nullable(), fields: z.record(z.string(), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])) }),
    reversible: true,
    writeScopes: { airtable: ["data.records:write"] },
  }),
  def({
    name: "calendar.create_hold",
    label: "Create a calendar hold for a team member",
    tier: "internal_write",
    connectors: ["google_workspace"],
    params: z.object({ memberId: z.uuid(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), title: z.string().trim().min(1).max(120) }),
    reversible: true,
    writeScopes: { google_workspace: ["https://www.googleapis.com/auth/calendar.events.owned"] },
  }),
  def({
    name: "crm.search",
    label: "Search the CRM",
    tier: "read",
    connectors: ["gohighlevel", "hubspot"],
    params: z.object({ query: z.string().trim().min(1).max(200) }),
    reversible: false,
    writeScopes: {},
  }),
  def({
    name: "crm.fetch_record",
    label: "Fetch a CRM record",
    tier: "read",
    connectors: ["gohighlevel", "hubspot"],
    params: crmRef,
    reversible: false,
    writeScopes: {},
  }),
  def({
    name: "calls.fetch_meeting",
    label: "Fetch a recorded meeting's details",
    tier: "read",
    connectors: ["fathom", "fireflies"],
    params: z.object({ meetingId: z.string().max(200) }),
    reversible: false,
    writeScopes: {},
  }),
  def({
    name: "airtable.search",
    label: "Search Airtable",
    tier: "read",
    connectors: ["airtable"],
    params: z.object({ baseId: z.string().regex(/^app[A-Za-z0-9]{3,30}$/), table: z.string().max(100), query: z.string().max(200) }),
    reversible: false,
    writeScopes: {},
  }),
  def({
    name: "calendar.list_events",
    label: "List calendar events",
    tier: "read",
    connectors: ["google_workspace"],
    params: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),
    reversible: false,
    writeScopes: {},
  }),
] as const;

export type ActionName = (typeof ACTIONS)[number]["name"];

const BY_NAME = new Map<string, ActionDef>(ACTIONS.map((action) => [action.name, action as ActionDef]));

export function actionDef(name: string): ActionDef | null {
  return BY_NAME.get(name) ?? null;
}

export const DEFAULT_INTERNAL_POLICY: InternalPolicy = "suggest";

export const TIER_LABEL: Record<ActionTier, string> = {
  reaches_person: "Reaches a person",
  internal_write: "Writes inside your tools",
  read: "Reads",
};

export type ActionRequest = {
  action: string;
  params: unknown;
  requestedBy: { kind: "agent"; agentId: string } | { kind: "person"; memberId: string };
};

export type ActionContext = {
  /** Owner policies for internal writes. Missing means Suggest. */
  policies: Map<string, InternalPolicy>;
  /** Connectors that are connected and healthy for this workspace. */
  healthyConnectors: Set<string>;
  /** Scopes granted per connector. */
  grantedScopes: Map<string, Set<string>>;
  agentWritesHalted: boolean;
  workspaceStatus: string;
};

export type ActionDecision =
  | { route: "approval_gate"; gateType: string }
  | { route: "suggest" }
  | { route: "execute" }
  | { route: "blocked"; reason: "unknown_action" | "bad_params" | "no_gate_type" | "not_connected" | "missing_scope" | "halted" | "workspace_paused" };

/**
 * Where a request goes. Pure: the same inputs always give the same answer,
 * and nothing that reaches a person is ever routed to "execute".
 */
export function decideAction(request: ActionRequest, context: ActionContext): ActionDecision {
  const action = actionDef(request.action);
  if (!action) return { route: "blocked", reason: "unknown_action" };
  if (!action.params.safeParse(request.params).success) return { route: "blocked", reason: "bad_params" };

  if (action.tier === "reaches_person") {
    if (!action.gateType) return { route: "blocked", reason: "no_gate_type" };
    return { route: "approval_gate", gateType: action.gateType };
  }

  if (action.tier === "read") return { route: "execute" };

  if (context.workspaceStatus === "paused" || context.workspaceStatus === "closed") return { route: "blocked", reason: "workspace_paused" };
  if (request.requestedBy.kind === "agent" && context.agentWritesHalted) return { route: "blocked", reason: "halted" };
  const connector = connectorFor(action, request.params);
  if (!connector || !context.healthyConnectors.has(connector)) return { route: "blocked", reason: "not_connected" };
  const scopes = context.grantedScopes.get(connector) ?? new Set<string>();
  if ((action.writeScopes[connector] ?? []).some((scope) => !scopes.has(scope))) return { route: "blocked", reason: "missing_scope" };

  const policy = context.policies.get(action.name) ?? DEFAULT_INTERNAL_POLICY;
  // A person pressing the button is the confirmation. An agent follows the Owner's setting.
  if (request.requestedBy.kind === "person") return { route: "execute" };
  return policy === "do_and_log" ? { route: "execute" } : { route: "suggest" };
}

export function connectorFor(action: ActionDef, params: unknown): string | null {
  const named = (params as { connector?: unknown } | null)?.connector;
  if (typeof named === "string") return action.connectors.includes(named) ? named : null;
  return action.connectors[0] ?? null;
}

export const BLOCK_REASON: Record<Extract<ActionDecision, { route: "blocked" }>["reason"], string> = {
  unknown_action: "That action does not exist.",
  bad_params: "The action was missing something it needs.",
  no_gate_type: "This kind of message cannot be approved yet, so it was not drafted.",
  not_connected: "The app this needs is not connected or needs attention.",
  missing_scope: "The app has not been given permission to make this change.",
  halted: "Agent writes are paused.",
  workspace_paused: "This workspace is paused.",
};
