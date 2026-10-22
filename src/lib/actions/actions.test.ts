import { describe, expect, it, vi } from "vitest";

import { executorFor, redactParams, type Fetch } from "@/lib/actions/executors";
import { MCP_SERVERS, mapMcpTool } from "@/lib/actions/mcp";
import { ACTIONS, decideAction, type ActionContext, type ActionRequest } from "@/lib/actions/registry";

const LEAD = "6f1c2a8e-1b2c-4d3e-8f90-123456789abc";
const DRAFT = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const agent: ActionRequest["requestedBy"] = { kind: "agent", agentId: "relay" };
const person: ActionRequest["requestedBy"] = { kind: "person", memberId: "m-1" };

function context(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    policies: new Map(),
    healthyConnectors: new Set(["hubspot", "gohighlevel", "airtable", "google_workspace"]),
    grantedScopes: new Map([
      ["hubspot", new Set(["crm.objects.contacts.write", "crm.objects.deals.write"])],
      ["airtable", new Set(["data.records:write"])],
    ]),
    agentWritesHalted: false,
    workspaceStatus: "active",
    ...overrides,
  };
}

const note = (requestedBy: ActionRequest["requestedBy"] = agent): ActionRequest => ({ action: "crm.add_note", params: { leadId: LEAD, connector: "hubspot", body: "Called, left voicemail." }, requestedBy });

describe("decideAction", () => {
  it("never executes anything that reaches a person, whatever the policy or requester", () => {
    const everything = context({ policies: new Map(ACTIONS.map((action) => [action.name, "do_and_log" as const])) });
    for (const action of ACTIONS.filter((candidate) => candidate.tier === "reaches_person")) {
      for (const requestedBy of [agent, person]) {
        const decision = decideAction({ action: action.name, params: { leadId: LEAD, draftId: DRAFT }, requestedBy }, everything);
        expect(decision.route === "approval_gate" || decision.route === "blocked").toBe(true);
      }
    }
  });

  it("sends email and text to the approval gate, and blocks kinds the gate cannot carry yet", () => {
    expect(decideAction({ action: "send.email", params: { leadId: LEAD, draftId: DRAFT }, requestedBy: agent }, context())).toEqual({ route: "approval_gate", gateType: "send_email" });
    expect(decideAction({ action: "send.text", params: { leadId: LEAD, draftId: DRAFT }, requestedBy: agent }, context())).toEqual({ route: "approval_gate", gateType: "send_text" });
    expect(decideAction({ action: "send.dm", params: { leadId: LEAD, draftId: DRAFT }, requestedBy: agent }, context())).toEqual({ route: "blocked", reason: "no_gate_type" });
  });

  it("blocks unknown actions and bad params", () => {
    expect(decideAction({ action: "http.request", params: {}, requestedBy: agent }, context())).toEqual({ route: "blocked", reason: "unknown_action" });
    expect(decideAction({ action: "sql.run", params: { query: "select 1" }, requestedBy: agent }, context())).toEqual({ route: "blocked", reason: "unknown_action" });
    expect(decideAction({ action: "crm.add_note", params: { leadId: "nope", connector: "hubspot", body: "x" }, requestedBy: agent }, context())).toEqual({ route: "blocked", reason: "bad_params" });
  });

  it("defaults agent internal writes to Suggest and honours Do and log", () => {
    expect(decideAction(note(), context())).toEqual({ route: "suggest" });
    expect(decideAction(note(), context({ policies: new Map([["crm.add_note", "do_and_log"]]) }))).toEqual({ route: "execute" });
  });

  it("treats a person pressing the button as the confirmation", () => {
    expect(decideAction(note(person), context())).toEqual({ route: "execute" });
  });

  it("stops writes on a halt, a paused workspace, a lost connection or a missing scope", () => {
    expect(decideAction(note(), context({ agentWritesHalted: true }))).toEqual({ route: "blocked", reason: "halted" });
    expect(decideAction(note(person), context({ workspaceStatus: "paused" }))).toEqual({ route: "blocked", reason: "workspace_paused" });
    expect(decideAction(note(person), context({ healthyConnectors: new Set() }))).toEqual({ route: "blocked", reason: "not_connected" });
    expect(decideAction(note(person), context({ grantedScopes: new Map() }))).toEqual({ route: "blocked", reason: "missing_scope" });
  });

  it("runs reads without a policy", () => {
    expect(decideAction({ action: "crm.search", params: { query: "acme" }, requestedBy: agent }, context())).toEqual({ route: "execute" });
  });
});

describe("mapMcpTool", () => {
  it("blocks servers that are not on the curated list", () => {
    expect(mapMcpTool("random-server", "anything")).toEqual({ allowed: false, reason: "server_not_listed" });
  });

  it("blocks tools that are not mapped and tools blocked on purpose", () => {
    expect(mapMcpTool("hubspot", "run_code")).toEqual({ allowed: false, reason: "tool_not_mapped" });
    expect(mapMcpTool("hubspot", "delete_crm_object")).toEqual({ allowed: false, reason: "tool_blocked" });
    expect(mapMcpTool("google_workspace", "gmail_send_message")).toEqual({ allowed: false, reason: "tool_blocked" });
  });

  it("maps every allowed tool to a registered action that never reaches a person", () => {
    for (const server of MCP_SERVERS) {
      for (const tool of Object.keys(server.tools)) {
        const decision = mapMcpTool(server.id, tool);
        if (decision.allowed) expect(decision.action.startsWith("send.")).toBe(false);
      }
    }
    expect(mapMcpTool("hubspot", "create_note")).toEqual({ allowed: true, action: "crm.add_note" });
  });
});

function fakeFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const route = routes[`${method} ${url}`];
    if (!route) return new Response("{}", { status: 404 });
    return new Response(route.status === 204 ? null : JSON.stringify(route.body ?? {}), { status: route.status ?? 200 });
  });
  return { fetch: impl as unknown as Fetch, calls };
}

describe("executors", () => {
  it("updates a HubSpot field, keeps the old value, and puts it back on undo", async () => {
    const base = "https://api.hubapi.com/crm/v3/objects/contacts/901";
    const { fetch, calls } = fakeFetch({
      [`GET ${base}?properties=hs_lead_status`]: { body: { properties: { hs_lead_status: "NEW" } } },
      [`PATCH ${base}`]: { body: {} },
    });
    const executor = executorFor("crm.update_field", "hubspot")!;
    const result = await executor.run({ token: "t", params: { field: "hs_lead_status", value: "OPEN" }, externalId: "901", fetch });
    expect(result).toMatchObject({ ok: true, before: { hs_lead_status: "NEW" }, after: { hs_lead_status: "OPEN" } });
    const undone = await executor.undo!({ token: "t", params: {}, externalId: "901", before: { hs_lead_status: "NEW" }, externalRef: "901", fetch });
    expect(undone.ok).toBe(true);
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: { properties: { hs_lead_status: "NEW" } } });
  });

  it("refuses to act on a lead with no linked record", async () => {
    const { fetch, calls } = fakeFetch({});
    const result = await executorFor("crm.add_note", "hubspot")!.run({ token: "t", params: { body: "x" }, externalId: null, fetch });
    expect(result).toEqual({ ok: false, code: "no_linked_record" });
    expect(calls).toHaveLength(0);
  });

  it("reports a vendor refusal without throwing", async () => {
    const { fetch } = fakeFetch({ "POST https://api.hubapi.com/crm/v3/objects/notes": { status: 401 } });
    const result = await executorFor("crm.add_note", "hubspot")!.run({ token: "t", params: { body: "x" }, externalId: "901", fetch });
    expect(result).toEqual({ ok: false, code: "not_allowed" });
  });

  it("has no executor for anything that reaches a person", () => {
    for (const action of ACTIONS.filter((candidate) => candidate.tier === "reaches_person")) {
      for (const connector of action.connectors) expect(executorFor(action.name, connector)).toBeNull();
    }
  });

  it("strips written text from a run record once it has run", () => {
    expect(redactParams({ leadId: LEAD, body: "Private note", title: "Call back" })).toEqual({
      leadId: LEAD,
      body: { redacted: true, length: 12 },
      title: { redacted: true, length: 9 },
    });
  });
});
