import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  usePathname: () => "/app/home",
}));

import { LibraryCard } from "@/app/(workspace)/app/agents/library/library-actions";
import { AddAgentsLink, AgentRail, AgentRoster } from "@/components/agents/agent-roster";
import { AgentSummaryContext } from "@/components/agents/summary-context";
import { OrgProvider } from "@/components/app/org-provider";
import { LiveStatusStrip } from "@/components/live/agent-panel";
import { LiveProvider, useWaitingTotal } from "@/components/live/live-provider";
import { CrewBand } from "@/components/workspace/crew-band";
import { registrySeed } from "@/lib/agents/roster";
import { buildAgentSummary, type AgentSummary, type RawAgent, type RawSummary } from "@/lib/agents/summary";
import type { ClientOrgState, WorkspaceRole } from "@/lib/auth/types";
import { rosterNavigation } from "@/lib/shell/nav";

const NOW = Date.parse("2026-10-22T15:00:00.000Z");
const ORG = "org-1";

function org(role: WorkspaceRole): ClientOrgState {
  return {
    user: { id: "u", email: "u@example.com", displayName: "Jordan" },
    org: { id: ORG, name: "North Roofing", slug: "north", timezone: "America/New_York", ghlLocationId: null, status: "active", isPlatformWorkspace: false },
    role: role === "operator" ? "setter" : role === "member" ? "member" : "owner",
    workspaceRole: role,
    isStaff: role === "service_team" || role === "platform_admin",
    isPlatformAdmin: role === "platform_admin",
    canApprove: role !== "operator",
    canSeeMoney: role === "owner",
    canExport: false,
    avatarPath: null,
    templateAccess: false,
    lostWorkspace: false,
    memberId: "m-me",
    surfaceAccess: "operator",
    memberships: [],
    cookieNeedsReset: false,
  } as ClientOrgState;
}

const FACTS = { waiting: { approvals: 0, questions: 0 }, openRun: null, latestRun: null, waitingRunsWithoutItem: 0, doneToday: 0, lastDoneAt: null, outputs: [] };

function agent(id: string, patch: Partial<RawAgent> = {}): RawAgent {
  const seed = registrySeed().agents.find((row) => row.id === id);
  return {
    id,
    area: seed ? (seed.area_id as string | null) : "sales",
    name: (seed?.name as string) ?? "Sample",
    sublabel: (seed?.sublabel as string) ?? "Test agent",
    description: (seed?.description as string) ?? "A sample agent for tests.",
    glyph: (seed?.glyph as string) ?? "spark",
    accent: (seed?.accent as string) ?? "neutral",
    promise: (seed?.promise as string) ?? "It never contacts a lead.",
    availability: "available",
    inCohort: true,
    planAllowed: true,
    lockedReason: "Not included on your current plan.",
    prerequisites: [],
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
    facts: { ...FACTS },
    ...patch,
  };
}

function summary(agents: RawAgent[], role: WorkspaceRole = "owner", waitingTotal = 0): AgentSummary {
  const raw: RawSummary = {
    orgId: ORG,
    generatedAt: new Date(NOW).toISOString(),
    access: role,
    workspace: { status: "active", agentsHalted: false, billingState: "active" },
    backlog: { pending: 0, oldestSeconds: 0 },
    sidebar: true,
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
    waitingTotal,
  };
  return buildAgentSummary(raw, { crm_connected: true, call_source: true }, NOW);
}

const BUILT_IN = ["sentry", "scribe", "relay", "compass", "assay"];

function Waiting() {
  return <span>{`total:${useWaitingTotal()}`}</span>;
}

function render(node: React.ReactNode, role: WorkspaceRole, value: AgentSummary | null): string {
  const initial = { orgId: ORG, runs: [], events: [], controls: [], waiting: [], loadedAt: new Date(NOW).toISOString() };
  return renderToString(
    <OrgProvider value={org(role)}>
      <LiveProvider orgId={ORG} workspaceStatus="active" initial={initial} initialCalm={false} offline>
        <AgentSummaryContext.Provider value={{ summary: value, refresh: () => undefined, reconnecting: false }}>{node}</AgentSummaryContext.Provider>
      </LiveProvider>
    </OrgProvider>
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const CREW_FACTS = {
  sentry: { mode: "live" as const, watching: 0, nextDeadlineAt: null },
  scribe: { lastFinishedAt: null },
  assay: { scoredToday: 0, hotToday: 0, hotNow: 0, paused: false },
  trustAutoRun: [],
};

describe("a newly registered agent drops in with no screen changes", () => {
  const withSample = summary([...BUILT_IN.map((id) => agent(id)), agent("sample_agent", { name: "Sample", sort: 9 })]);
  const without = summary(BUILT_IN.map((id) => agent(id)));

  it("appears in the sidebar roster, the icon rail, the status strip, the crew band and the Library, and goes when removed", () => {
    const surfaces = (value: AgentSummary) => [
      text(render(<AgentRoster />, "owner", value)),
      render(<AgentRail />, "owner", value),
      text(render(<LiveStatusStrip />, "owner", value)),
      text(render(<CrewBand facts={CREW_FACTS} now={NOW} />, "owner", value)),
    ];
    for (const html of surfaces(withSample)) expect(html).toContain("Sample");
    const sample = withSample.agents.find((row) => row.id === "sample_agent")!;
    expect(text(render(<LibraryCard row={sample} detail={null} readOnly={false} role="owner" />, "owner", withSample))).toContain("Sample");
    for (const html of surfaces(without)) expect(html).not.toContain("Sample");
  });
});

describe("one count everywhere", () => {
  const value = summary(
    [
      ...BUILT_IN.filter((id) => id !== "relay" && id !== "scribe").map((id) => agent(id)),
      agent("relay", { facts: { ...FACTS, waiting: { approvals: 3, questions: 0 } } }),
      agent("scribe", { facts: { ...FACTS, waiting: { approvals: 0, questions: 1 } } }),
    ],
    "owner",
    4,
  );

  it("agrees between the Sales header, each row, the status strip and the Decisions total", () => {
    const roster = text(render(<AgentRoster />, "owner", value));
    expect(roster).toContain("3 drafts waiting");
    expect(roster).toContain("1 question");
    expect(render(<AgentRoster />, "owner", value)).toContain('aria-label="Sales, 4 waiting on you"');
    expect(text(render(<LiveStatusStrip />, "owner", value))).toContain("4 waiting on you");
    expect(text(render(<Waiting />, "owner", value))).toContain("total:4");
    const rows = value.agents.reduce((sum, row) => sum + row.waiting.total, 0);
    const area = value.areas.find((item) => item.id === "sales")!.waiting;
    expect([rows, area, value.waitingTotal]).toEqual([4, 4, 4]);
  });
});

describe("rows by state and role", () => {
  it("never shows locked or available agents as rows, and shows setup and confirmation rows", () => {
    const value = buildAgentSummary(
      {
        ...(summary([]) as unknown as RawSummary),
        orgId: ORG,
        generatedAt: new Date(NOW).toISOString(),
        access: "owner",
        workspace: { status: "active", agentsHalted: false, billingState: "active" },
        backlog: { pending: 0, oldestSeconds: 0 },
        sidebar: true,
        areas: summary([]).areas.map((area) => ({ ...area, recordKind: "lead", sort: 1, workPage: area.workPage ? { ...area.workPage, roles: ["owner"] } : null, homePage: area.homePage ? { href: area.homePage, roles: ["owner"] } : null })),
        agents: [
          agent("relay", { planAllowed: false }),
          agent("scribe", { stage: "off" }),
          agent("sentry", { prerequisites: ["crm_connected"] }),
          agent("assay", { stage: "pending", requestedByLabel: "Sam, Vistrial Service Team" }),
        ],
        waitingTotal: 0,
      },
      { crm_connected: false, call_source: true },
      NOW,
    );
    const html = text(render(<AgentRoster />, "owner", value));
    expect(html).not.toContain("Relay");
    expect(html).not.toContain("Scribe");
    expect(html).toContain("Connect your CRM");
    expect(html).toContain("Waiting for your OK");
  });

  it("gives Operators a slim list about their own leads, with no areas, actions or Library", () => {
    const value = summary(
      [
        agent("relay", { facts: { ...FACTS, waiting: { approvals: 1, questions: 0 }, outputs: [{ id: "o", kind: "approval", title: "Follow-up for a lead", status: "pending", at: new Date(NOW).toISOString(), leadId: "l1", leadName: "Jordan Reyes" }] } }),
        agent("scribe"),
      ],
      "operator",
      1,
    );
    const html = text(render(<AgentRoster />, "operator", value));
    expect(html).toContain("Follow-up for Jordan Reyes");
    expect(html).not.toContain("Scribe");
    expect(html).not.toContain("Sales");
    expect(render(<AddAgentsLink />, "operator", value)).not.toContain("/app/agents/library");
  });

  it("gives Members a read-only roster and a read-only Library line", () => {
    const value = summary([agent("relay")], "member");
    expect(text(render(<AgentRoster />, "member", value))).toContain("Relay");
    expect(text(render(<AddAgentsLink />, "member", value))).toContain("Agents in this workspace");
  });

  it("shows skeleton rows until the summary arrives, never another workspace's rows", () => {
    expect(text(render(<AgentRoster />, "owner", null))).toContain("Loading your agents.");
    const other = { ...summary([agent("relay")]), orgId: "org-2" };
    expect(text(render(<AgentRoster />, "owner", other))).not.toContain("Relay");
  });
});

describe("navigation with the agent roster", () => {
  it("keeps customer fixed destinations at six or fewer, and the phone bar at five", () => {
    for (const role of ["owner", "member", "operator"] as const) {
      const nav = rosterNavigation({ role, templateAccess: false, workspaceName: "North", areaWorkPages: ["/app/cases"] });
      const fixed = nav.groups.filter((group) => !group.roster).flatMap((group) => group.items);
      expect(fixed.length).toBeLessThanOrEqual(6);
      expect(nav.groups.some((group) => group.roster)).toBe(true);
      expect(nav.phone.length + (nav.more.length ? 1 : 0)).toBeLessThanOrEqual(5);
      expect(nav.phone.some((item) => item.sheet === "agents")).toBe(true);
    }
  });

  it("moves Case Files under Sales for the Owner, keeps it for Operators, and gives Operators My day, My Leads, Agents, Profile on the phone", () => {
    const owner = rosterNavigation({ role: "owner", templateAccess: false, areaWorkPages: ["/app/cases"] });
    expect(owner.groups.flatMap((group) => group.items).map((item) => item.label)).toEqual(["Overview", "Results", "Settings"]);
    const operator = rosterNavigation({ role: "operator", templateAccess: false, areaWorkPages: ["/app/cases"] });
    expect(operator.phone.map((item) => item.label)).toEqual(["My day", "My Leads", "Agents", "Profile"]);
    expect(operator.groups.flatMap((group) => group.items).map((item) => item.label)).toContain("Case Files");
  });

  it("replaces Sales and Compass in the staff workspace group with the roster", () => {
    const staff = rosterNavigation({ role: "service_team", templateAccess: false, workspaceName: "North", areaWorkPages: [] });
    const here = staff.groups.find((group) => group.id === "here")!;
    expect(here.items.map((item) => item.id)).not.toContain("agents");
    const index = staff.groups.findIndex((group) => group.id === "here");
    expect(staff.groups[index + 1].roster).toBe(true);
  });
});
