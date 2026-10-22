import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { agentContract, waitingPhrase } from "@/lib/agents/contract";
import { AGENT_AREAS, AGENTS, LIVE_AGENT_IDS, registrySeed } from "@/lib/agents/roster";
import { buildAgentSummary, outputLine, pinnedPages, rowLabel, STUCK_AFTER_MS, type RawAgent, type RawSummary } from "@/lib/agents/summary";
import { commitActivity, compareRuns, type ActivityWrite } from "@/lib/live/words";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const NOW = Date.parse("2026-10-21T15:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

function seededMigration(): string {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  const withSeed = files.filter((name) => readFileSync(join(MIGRATIONS, name), "utf8").includes("$seed$"));
  return readFileSync(join(MIGRATIONS, withSeed[withSeed.length - 1]), "utf8");
}

function rawAgent(id: string, patch: Partial<RawAgent> = {}): RawAgent {
  const seed = registrySeed().agents.find((agent) => agent.id === id);
  return {
    id,
    area: (seed?.area_id as string | null) ?? "sales",
    name: (seed?.name as string) ?? "Sample",
    sublabel: (seed?.sublabel as string) ?? "Test agent",
    description: (seed?.description as string) ?? "A sample agent for tests.",
    glyph: (seed?.glyph as string) ?? "spark",
    accent: (seed?.accent as string) ?? "neutral",
    promise: (seed?.promise as string) ?? "Never contacts a lead.",
    availability: "available",
    inCohort: true,
    planAllowed: true,
    lockedReason: "Not included on your current plan.",
    prerequisites: (seed?.prerequisites as string[]) ?? [],
    sort: (seed?.sort as number) ?? 9,
    startsOn: false,
    activitySource: (seed?.activity_source as "runs" | "scores") ?? "runs",
    outputSource: (seed?.output_source as RawAgent["outputSource"]) ?? "activity",
    version: 1,
    stage: "on",
    paused: false,
    pausedByName: null,
    pausedAt: null,
    pausedReason: null,
    halted: false,
    haltedAt: null,
    queue: null,
    facts: {
      waiting: { approvals: 0, questions: 0 },
      openRun: null,
      latestRun: null,
      waitingRunsWithoutItem: 0,
      doneToday: 0,
      lastDoneAt: null,
      outputs: [],
    },
    ...patch,
  };
}

function raw(agents: RawAgent[], patch: Partial<RawSummary> = {}): RawSummary {
  return {
    orgId: "org-a",
    generatedAt: new Date(NOW).toISOString(),
    access: "owner",
    workspace: { status: "active", agentsHalted: false, billingState: "active" },
    backlog: { pending: 0, oldestSeconds: 0 },
    areas: registrySeed().areas.map((area) => ({
      id: area.id as string,
      name: area.name as string,
      description: area.description as string,
      recordKind: area.record_kind as string,
      workPage: area.work_page as RawSummary["areas"][number]["workPage"],
      homePage: area.home_page as RawSummary["areas"][number]["homePage"],
      availability: area.availability as "available" | "coming_soon",
      sort: area.sort as number,
    })),
    agents,
    waitingTotal: 0,
    ...patch,
  };
}

const ALL_SETUP = { crm_connected: true, call_source: true };

describe("agent registry", () => {
  it("seeds the database from the roster, value for value", () => {
    const sql = seededMigration();
    const json = sql.slice(sql.indexOf("$seed$") + 6, sql.lastIndexOf("$seed$"));
    expect(JSON.parse(json)).toEqual(registrySeed());
  });

  it("puts Sentry, Scribe, Relay and Assay in Sales, Compass across areas, and no agent in Client Retention", () => {
    const sales = LIVE_AGENT_IDS.filter((id) => AGENTS[id].area === "sales").sort((a, b) => AGENTS[a].sort - AGENTS[b].sort);
    expect(sales).toEqual(["sentry", "scribe", "relay", "assay"]);
    expect(AGENTS.compass.area).toBeNull();
    const retention = AGENT_AREAS.find((area) => area.id === "client_retention");
    expect(retention?.availability).toBe("coming_soon");
    expect(LIVE_AGENT_IDS.some((id) => AGENTS[id].area === "client_retention")).toBe(false);
  });

  it("includes every current agent on Private Access and Custom", () => {
    for (const id of LIVE_AGENT_IDS) {
      expect(AGENTS[id].plans.included).toEqual(expect.arrayContaining(["private_access", "custom"]));
      expect(AGENTS[id].availability).toBe("available");
      expect(AGENTS[id].plans.addOn).toBe(false);
    }
  });

  it("writes no em-dashes in registry, contract or summary copy", () => {
    const files = ["src/lib/agents/roster.ts", "src/lib/agents/contract.ts", "src/lib/agents/summary.ts", "supabase/migrations/20261021010000_agent_registry.sql"];
    for (const file of files) expect(readFileSync(join(process.cwd(), file), "utf8")).not.toContain("—");
  });

  it("offers Run now only for Relay, Sentry and Assay, at 10 minutes and 6 a day", () => {
    for (const id of ["relay", "sentry", "assay"]) {
      expect(agentContract(id).quickActions.runNow).toMatchObject({ cooldownMinutes: 10, dailyCap: 6 });
    }
    expect(agentContract("scribe").quickActions.runNow).toBeNull();
    expect(agentContract("compass").quickActions.runNow).toBeNull();
    expect(agentContract("sample_agent").pages("sample_agent")[0].href).toBe("/app/agents/sample_agent");
    expect(waitingPhrase("relay", { approvals: 3, questions: 1 })).toBe("3 drafts waiting, 1 question");
  });
});

describe("pinned work pages", () => {
  const sales = {
    label: "Case Files",
    href: "/app/cases",
    roles: ["owner", "operator", "service_team", "platform_admin"],
    also: [{ label: "Calendar", href: "/app/calendar", roles: ["owner", "member", "operator", "service_team", "platform_admin"] }],
  };

  it("keeps Case Files and hides Calendar until the flag is on", () => {
    expect(pinnedPages(sales, "owner", false).map((page) => page.label)).toEqual(["Case Files"]);
    expect(pinnedPages(sales, "owner", true).map((page) => page.label)).toEqual(["Case Files", "Calendar"]);
    expect(pinnedPages(sales, "member", true).map((page) => page.href)).toEqual(["/app/calendar"]);
  });
});

describe("shared agent summary", () => {
  it("derives the workspace state of each agent", () => {
    const summary = buildAgentSummary(
      raw([
        rawAgent("sentry"),
        rawAgent("relay", { planAllowed: false }),
        rawAgent("scribe", { stage: "off" }),
        rawAgent("assay", { stage: null, startsOn: true, activitySource: "scores", outputSource: "tiers" }),
        rawAgent("compass", { availability: "beta", inCohort: false }),
      ]),
      { crm_connected: false, call_source: true },
      NOW,
    );
    const state = Object.fromEntries(summary.agents.map((agent) => [agent.id, agent.state]));
    expect(state).toEqual({ sentry: "needs_setup", relay: "locked", scribe: "available", assay: "on", compass: "not_available" });
    const sentry = summary.agents.find((agent) => agent.id === "sentry")!;
    expect(sentry.line).toBe("Connect your CRM");
    expect(sentry.setupStep?.href).toBe("/app/settings/connections");
    expect(summary.agents.filter((agent) => agent.inSidebar).map((agent) => agent.id)).toEqual(["sentry", "assay"]);
    expect(summary.agents.find((agent) => agent.id === "relay")!.lockedReason).toContain("Not included");
  });

  it("shows who paused an agent, and the Vistrial team's pause and stop", () => {
    const person = buildAgentSummary(raw([rawAgent("relay", { paused: true, pausedByName: "Dana", pausedAt: minutesAgo(5) })]), ALL_SETUP, NOW);
    expect(person.agents[0]).toMatchObject({ presence: "paused", stateLabel: "Paused", line: "Paused by Dana." });
    expect(person.agents[0].paused).toMatchObject({ byName: "Dana", byVistrial: false });

    const halted = buildAgentSummary(raw([rawAgent("relay", { halted: true, haltedAt: minutesAgo(2) })]), ALL_SETUP, NOW);
    expect(halted.agents[0]).toMatchObject({ presence: "paused", stateLabel: "Paused by the Vistrial team" });
    expect(halted.agents[0].paused?.byVistrial).toBe(true);

    const stopped = buildAgentSummary(
      raw([rawAgent("scribe")], { workspace: { status: "active", agentsHalted: true, billingState: null } }),
      ALL_SETUP,
      NOW,
    );
    expect(stopped.agents[0].stateLabel).toBe("Paused by the Vistrial team");
  });

  it("shows the real step while working, and Needs attention once progress stops", () => {
    const working = rawAgent("scribe", {
      facts: { ...rawAgent("scribe").facts!, openRun: { id: "r1", status: "working", step: "Reading the call from 2:14 PM", lastProgressAt: minutesAgo(1) } },
    });
    expect(buildAgentSummary(raw([working]), ALL_SETUP, NOW).agents[0]).toMatchObject({
      presence: "working",
      line: "Reading the call from 2:14 PM",
      currentRunId: "r1",
    });

    const stale = rawAgent("scribe", {
      facts: { ...rawAgent("scribe").facts!, openRun: { id: "r1", status: "working", step: "Reading", lastProgressAt: new Date(NOW - STUCK_AFTER_MS - 1000).toISOString() } },
    });
    expect(buildAgentSummary(raw([stale]), ALL_SETUP, NOW).agents[0].presence).toBe("attention");
  });

  it("never shows a stale Working state as live when the copy is behind", () => {
    const working = rawAgent("scribe", {
      facts: { ...rawAgent("scribe").facts!, openRun: { id: "r1", status: "working", step: "Reading", lastProgressAt: minutesAgo(1) } },
    });
    const summary = buildAgentSummary(raw([working], { backlog: { pending: 3, oldestSeconds: 30 } }), ALL_SETUP, NOW);
    expect(summary.reconnecting).toBe(true);
    expect(summary.agents[0].presence).toBe("attention");
  });

  it("counts waiting items once, by agent, by area, and in total", () => {
    const relay = rawAgent("relay", { facts: { ...rawAgent("relay").facts!, waiting: { approvals: 3, questions: 0 } } });
    const scribe = rawAgent("scribe", { facts: { ...rawAgent("scribe").facts!, waiting: { approvals: 0, questions: 1 } } });
    const summary = buildAgentSummary(raw([relay, scribe, rawAgent("compass")], { waitingTotal: 4 }), ALL_SETUP, NOW);
    const relayRow = summary.agents.find((agent) => agent.id === "relay")!;
    expect(relayRow).toMatchObject({ presence: "waiting", line: "3 drafts waiting" });
    expect(rowLabel(relayRow)).toBe("Relay, waiting on you, 3 drafts waiting");
    const sales = summary.areas.find((area) => area.id === "sales")!;
    expect(sales.waiting).toBe(4);
    expect(sales.urgent).toBe("waiting");
    expect(summary.waitingTotal).toBe(4);
    expect(summary.agents.reduce((sum, agent) => sum + agent.waiting.total, 0)).toBe(summary.waitingTotal);
    expect(summary.areas.find((area) => area.id === "client_retention")!.inSidebar).toBe(false);
  });

  it("reports a failed run as Stopped, and the last real action when idle", () => {
    const failed = rawAgent("relay", {
      facts: { ...rawAgent("relay").facts!, latestRun: { id: "r9", status: "failed", plainError: "Relay could not reach your CRM.", finishedAt: minutesAgo(30) } },
    });
    expect(buildAgentSummary(raw([failed]), ALL_SETUP, NOW).agents[0]).toMatchObject({ presence: "stopped", line: "Relay could not reach your CRM." });

    const idle = rawAgent("scribe", { facts: { ...rawAgent("scribe").facts!, doneToday: 3, lastDoneAt: minutesAgo(12) } });
    expect(buildAgentSummary(raw([idle]), ALL_SETUP, NOW).agents[0].line).toBe("3 finished today, last 12 minutes ago");

    const assay = rawAgent("assay", { activitySource: "scores", facts: { ...rawAgent("assay").facts!, doneToday: 14, lastDoneAt: minutesAgo(3) } });
    expect(buildAgentSummary(raw([assay]), ALL_SETUP, NOW).agents[0].line).toBe("14 score changes today, last 3 minutes ago");
  });

  it("writes Show its work lines from titles and names only, linked to what the person can open", () => {
    expect(outputLine({ id: "a", kind: "approval", title: "Follow-up for a lead", status: "pending", at: minutesAgo(2), leadId: "l1", leadName: "Jordan Reyes", runId: "r1" }, "owner", NOW)).toEqual({
      id: "a",
      text: "Follow-up for Jordan Reyes, waiting for approval",
      at: minutesAgo(2),
      href: "/app/cases/l1",
    });
    expect(outputLine({ id: "w", kind: "window", state: "at_risk", deadlineAt: new Date(NOW + 12 * 60_000).toISOString(), at: minutesAgo(1), leadId: "l2", leadName: "Alex Kim" }, "owner", NOW).text).toBe(
      "Alex Kim's window ends in 12 minutes",
    );
    expect(outputLine({ id: "t", kind: "tier", tier: "warm", previousTier: "cool", at: minutesAgo(1), leadId: "l3", leadName: "Dana Brooks" }, "owner", NOW).text).toBe(
      "Dana Brooks moved to Warm",
    );
    const member = outputLine({ id: "f", kind: "file", title: "Case file built for a lead", at: minutesAgo(1), leadId: "l4", leadName: "Maria Lopez", runId: "r4" }, "member", NOW);
    expect(member).toMatchObject({ text: "Case file built for Maria Lopez", href: "/app/runs/r4" });
    const hidden = outputLine({ id: "g", kind: "file", title: "Case file built for a lead", at: minutesAgo(1), leadId: null, leadName: null, runId: "r5" }, "owner", NOW);
    expect(hidden.text).toBe("Case file built for a lead");
  });

  it("shows a newly registered agent everywhere with no code of its own", () => {
    const sample = rawAgent("sample_agent", {
      area: "sales",
      name: "Sample",
      glyph: "not-a-glyph",
      accent: "not-an-accent",
      facts: { ...rawAgent("sample_agent").facts!, waiting: { approvals: 2, questions: 0 } },
    });
    const row = buildAgentSummary(raw([sample]), ALL_SETUP, NOW).agents[0];
    expect(row).toMatchObject({ id: "sample_agent", glyph: "spark", accent: "neutral", inSidebar: true, line: "2 items waiting" });
  });
});

describe("live record copy", () => {
  const op: ActivityWrite = {
    idempotencyKey: "run:org:relay:t1",
    seq: 1,
    occurredAt: "2026-10-21T15:00:00.000Z",
    workspaceId: "org",
    job: "relay",
    kind: "run",
    action: "insert",
    row: { id: "new-id", trigger_key: "t1", subject_label: "Follow-up for a lead" },
  };

  it("copies to Postgres first and keeps both records on the first run for a repeated trigger", async () => {
    const order: string[] = [];
    let convexId: unknown = null;
    await commitActivity(op, {
      sink: () => "convex",
      copy: async () => {
        order.push("copy");
        return { applied: false, id: "first-id", existing: true };
      },
      convex: async (write) => {
        order.push("convex");
        convexId = write.row.id;
      },
      outbox: async () => undefined,
      postgres: async () => undefined,
    });
    expect(order).toEqual(["copy", "convex"]);
    expect(convexId).toBe("first-id");
  });

  it("keeps a change it could not copy in the outbox and still records it", async () => {
    const waiting: string[] = [];
    const where = await commitActivity(op, {
      sink: () => "convex",
      copy: async () => {
        throw new Error("down");
      },
      copyOutbox: async (write) => {
        waiting.push(write.idempotencyKey);
      },
      convex: async () => undefined,
      outbox: async () => undefined,
      postgres: async () => undefined,
    });
    expect(where).toBe("convex");
    expect(waiting).toEqual(["run:org:relay:t1"]);
  });

  it("counts drift between the two records, but not a run Postgres marked stuck", () => {
    const drift = compareRuns(
      [
        { id: "a", status: "completed" },
        { id: "b", status: "working" },
        { id: "c", status: "working" },
        { id: "d", status: "completed" },
      ],
      [
        { id: "a", status: "completed" },
        { id: "b", status: "stuck" },
        { id: "c", status: "failed" },
        { id: "e", status: "queued" },
      ],
    );
    expect(drift).toMatchObject({ convexRuns: 4, postgresRuns: 4, missingInPostgres: 1, missingInConvex: 1, statusMismatch: 1 });
  });
});
