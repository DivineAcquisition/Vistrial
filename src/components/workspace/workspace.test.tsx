import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  usePathname: () => "/app/home",
}));

import { OrgProvider } from "@/components/app/org-provider";
import { LiveProvider } from "@/components/live/live-provider";
import { CrewBand, OperatorAgentLine } from "@/components/workspace/crew-band";
import { DecisionsSection } from "@/components/workspace/decisions";
import { LiveStream } from "@/components/workspace/stream";
import type { ClientOrgState, WorkspaceRole } from "@/lib/auth/types";
import type { LiveSnapshot } from "@/lib/live/load";
import type { LiveRun, WaitingItem } from "@/lib/live/model";
import type { DecisionsData } from "@/lib/workspace/load";

const NOW = Date.parse("2026-10-20T16:00:00Z");
const ORG = "org-1";

function org(role: WorkspaceRole, canApprove: boolean): ClientOrgState {
  return {
    user: { id: "u", email: "u@example.com", displayName: "Jordan" },
    org: { id: ORG, name: "North Roofing", slug: "north", timezone: "America/New_York", ghlLocationId: null, status: "active", isPlatformWorkspace: false },
    role: role === "operator" ? "setter" : role === "member" ? "member" : "owner",
    workspaceRole: role,
    isStaff: role === "service_team" || role === "platform_admin",
    isPlatformAdmin: role === "platform_admin",
    canApprove,
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

function waiting(id: string, extra: Partial<WaitingItem> = {}): WaitingItem {
  return { id, agentId: "relay", runId: null, kind: "approval", title: `Follow up with lead ${id}`, reason: "Asked for a quote", preview: "Hi there", leadIds: [`lead-${id}`], status: "pending", createdAt: new Date(NOW - 60_000).toISOString(), ...extra };
}

function run(id: string, extra: Partial<LiveRun> = {}): LiveRun {
  return {
    id,
    orgId: ORG,
    agentId: "scribe",
    leadId: null,
    actorMemberId: null,
    subjectLabel: "the call with Jordan Reyes",
    subjectHref: null,
    status: "completed",
    currentStepLabel: null,
    plan: [],
    reasonSummary: null,
    plainError: null,
    needsPerson: null,
    sources: [],
    configVersion: null,
    batchId: null,
    simulated: false,
    cause: null,
    createdAt: new Date(NOW - 120_000).toISOString(),
    startedAt: null,
    finishedAt: new Date(NOW - 60_000).toISOString(),
    lastProgressAt: new Date(NOW - 60_000).toISOString(),
    ...extra,
  };
}

function render(node: React.ReactNode, value: ClientOrgState, snapshot: Partial<LiveSnapshot> = {}): string {
  const initial: LiveSnapshot = { orgId: ORG, runs: [], events: [], controls: [], waiting: [], loadedAt: new Date(NOW).toISOString(), ...snapshot };
  return renderToString(
    <OrgProvider value={value}>
      <LiveProvider orgId={ORG} workspaceStatus="active" initial={initial} initialCalm={false}>
        {node}
      </LiveProvider>
    </OrgProvider>
  );
}

const data = (canDecide: boolean): DecisionsData => ({ meta: {}, suggestedTasks: [], reconnect: [], lastDecisionAt: null, canDecide });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("decisions by role", () => {
  const items = [waiting("a"), waiting("b")];

  it("owners decide each draft, with one-at-a-time review and no bulk approval", () => {
    const html = text(render(<DecisionsSection data={data(true)} queue={[]} now={NOW} />, org("owner", true), { waiting: items }));
    expect(html).toContain("Review next");
    expect(html.match(/Approve/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/approve all/i);
  });

  it("members without approval permission see a count, not the drafts", () => {
    const html = text(render(<DecisionsSection data={data(false)} queue={[]} now={NOW} />, org("member", false), { waiting: items }));
    expect(html).toContain("2 decisions are waiting. Ask the Owner to approve");
    expect(html).not.toContain("Hi there");
    expect(html).not.toContain("Approve");
  });

  it("operators see suggestions for their leads but cannot approve", () => {
    const html = text(render(<DecisionsSection data={data(false)} queue={[]} now={NOW} />, org("operator", false), { waiting: [waiting("a")] }));
    expect(html).toContain("An owner or approver decides this.");
    expect(html).not.toContain("Review next");
  });

  it("says nothing is waiting, honestly, when nothing is", () => {
    const html = text(render(<DecisionsSection data={data(true)} queue={[]} now={NOW} />, org("owner", true)));
    expect(html).toContain("Nothing is waiting on you.");
  });
});

describe("crew band and stream", () => {
  const facts = {
    sentry: { mode: "live" as const, watching: 0, nextDeadlineAt: null },
    scribe: { lastFinishedAt: null },
    assay: { scoredToday: 0, hotToday: 0, hotNow: 0, paused: false },
    trustAutoRun: [],
  };

  it("shows quiet, true states with no activity, and the real trust line", () => {
    const html = text(render(<CrewBand facts={facts} now={NOW} />, org("owner", true)));
    for (const name of ["Sentry", "Scribe", "Relay", "Assay", "Compass"]) expect(html).toContain(name);
    expect(html).not.toContain("Working");
    expect(html).toContain("No lead is waiting on a reply right now.");
    expect(html).toContain("Waiting for your first call.");
    expect(html).toContain("No drafts waiting.");
    expect(html).toContain("Nothing is sent to a lead without your approval.");
  });

  it("says when an agent is working, from the live record", () => {
    const html = text(
      render(<CrewBand facts={facts} now={NOW} />, org("owner", true), {
        runs: [run("w", { status: "working", currentStepLabel: "Reading the call from 2:14 PM", finishedAt: null })],
      })
    );
    expect(html).toContain("Reading the call from 2:14 PM.");
  });

  it("gives operators one slim line", () => {
    const html = text(render(<OperatorAgentLine />, org("operator", false), { waiting: [waiting("a")] }));
    expect(html).toContain("Your agents are working. 1 suggestion for your leads.");
  });

  it("streams real items only, and says so when there are none", () => {
    expect(text(render(<LiveStream moves={[]} />, org("owner", true)))).toContain("Your agents have not done anything yet today.");
    const html = text(render(<LiveStream moves={[{ id: "m", leadId: "l", name: "Dana Brooks", tier: "warm", at: new Date(NOW - 30_000).toISOString() }]} />, org("owner", true), { runs: [run("r1")] }));
    expect(html).toContain("Scribe finished the call with Jordan Reyes.");
    expect(html).toContain("Assay moved Dana Brooks to Warm.");
  });
});

// ---------------------------------------------------------------------------
// Static guards: the gate and privacy rules hold in the source itself.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "../../..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const WORKSPACE_SOURCES = [
  ...files(path.join(ROOT, "src/components/workspace")),
  ...files(path.join(ROOT, "src/lib/workspace")),
  path.join(ROOT, "src/app/(workspace)/app/home/workspace-actions.ts"),
];

describe("workspace source guards", () => {
  it("never sends: no dispatch, send, or bulk-approve path from this screen", () => {
    for (const file of WORKSPACE_SOURCES) {
      const source = readFileSync(file, "utf8");
      for (const banned of [/ghl_dispatches"\)\.insert/, /sendSms|sendEmail|sendMessage/, /runDraft/, /approveAll|approve_all/i, /gate_mark_sent/, /gate_decide/]) {
        expect(source, `${path.relative(ROOT, file)} uses ${banned}`).not.toMatch(banned);
      }
    }
  });

  it("asks Relay for drafts only through the gated request path", () => {
    const actions = readFileSync(path.join(ROOT, "src/app/(workspace)/app/home/workspace-actions.ts"), "utf8");
    const rpcs = [...actions.matchAll(/rpc\("([a-z_]+)"/g)].map((match) => match[1]);
    expect(new Set(rpcs)).toEqual(new Set(["compass_request_draft", "assay_lead_score"]));
  });

  it("never reads message or transcript text into summaries", () => {
    const load = readFileSync(path.join(ROOT, "src/lib/workspace/load.ts"), "utf8");
    const selects = [...load.matchAll(/\.select\("([^"]+)"/g)].map((match) => match[1]);
    for (const columns of selects) {
      expect(columns, columns).not.toMatch(/transcript|outbound_body|inbound_body|message_text/);
      if (/\bbody\b/.test(columns)) expect(columns).toBe("channel, body, final_body, footer");
    }
  });

  it("writes no em-dashes into product copy", () => {
    for (const file of WORKSPACE_SOURCES) {
      const strings = readFileSync(file, "utf8").match(/"[^"\n]*"|`[^`]*`/g) ?? [];
      for (const value of strings) expect(value, path.relative(ROOT, file)).not.toContain("\u2014");
    }
  });
});
