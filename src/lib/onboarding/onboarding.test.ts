import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ACTIVATION_ORDER, activationStepCopy, nextActivationStep, readActivation } from "./activation";
import { checkinItems, type CheckinFacts } from "./checkins";
import { SETUP_STEPS, nextSlug, previousSlug, resumeSlug, slugDone } from "./customer-steps";
import { lookupName, readRecords, recordMatches } from "./email-domain";
import { aiEligible, basicCaseFileSummary, displayLabel, inWindow, parseCrmContact, problemsFor } from "./import-plan";
import { ownerLine, staffLine } from "./notify";
import { SAMPLE_STATES, sampleCustomerView } from "./samples";
import { filterQueue, queueParams, queueRisk, readQueueFilters, sortQueue } from "./queue";
import { REGISTRATION_FIELDS, REJECTION_CODES, REJECTION_GUIDANCE, validateRegistration } from "./registration";
import { STAGE_KEYS, daysSince, progressCounts, readSteps, waitingText, type CustomerStep } from "./stages";
import type { QueueRow } from "./load";

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATION = readFileSync(path.join(ROOT, "supabase/migrations/20261012010000_onboarding_flow.sql"), "utf8");
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-12T12:00:00Z");

function step(key: CustomerStep["key"], state: CustomerStep["state"], extra: Partial<CustomerStep> = {}): CustomerStep {
  return { key, label: key, why: "", owner: "customer", estimate: "", state, status: "not_started", ...extra };
}

describe("one stage list", () => {
  it("matches the stages the database seeds, in order", () => {
    const seeded = [...MIGRATION.matchAll(/^\s+\('([a-z_]+)', (\d+), '/gm)].map((match) => ({ key: match[1], position: Number(match[2]) }));
    const stages = seeded.filter((row) => (STAGE_KEYS as readonly string[]).includes(row.key!));
    expect(stages.map((row) => row.key)).toEqual([...STAGE_KEYS]);
    expect(stages.map((row) => row.position)).toEqual(STAGE_KEYS.map((_, index) => index + 1));
  });

  it("has a customer screen for every stage the customer acts on", () => {
    const screened = new Set(SETUP_STEPS.map((item) => item.stage).filter(Boolean));
    for (const key of ["approach", "business_details", "crm", "messaging", "email", "approvers", "escalation", "team", "lead_import", "sample_test", "go_live"]) {
      expect(screened.has(key as never)).toBe(true);
    }
  });
});

describe("steps and progress", () => {
  it("reads only well-formed steps", () => {
    expect(readSteps([step("crm", "done"), { key: "crm" }, null, "x"])).toHaveLength(1);
    expect(readSteps({})).toEqual([]);
  });

  it("counts done and skipped as done", () => {
    const steps = [step("crm", "done"), step("email", "skipped"), step("team", "waiting_on_customer")];
    expect(progressCounts(steps).done).toBe(2);
    expect(progressCounts(steps).total).toBe(3);
  });

  it("says how long something has waited, in plain words", () => {
    expect(daysSince(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe(3);
    expect(daysSince(null, NOW)).toBeNull();
    expect(waitingText(new Date(NOW - 60_000).toISOString(), NOW)).toBe("since today");
  });

  it("resumes where the Owner stopped", () => {
    const extra = { welcomeSeen: true, sampleStarted: false };
    expect(resumeSlug([], { welcomeSeen: false, sampleStarted: false })).toBe("welcome");
    expect(resumeSlug([step("approach", "done"), step("business_details", "waiting_on_customer")], extra)).toBe("business");
    expect(resumeSlug([step("crm", "blocked")], extra)).toBe("crm");
    expect(resumeSlug([], { welcomeSeen: true, sampleStarted: true })).toBe("review");
    expect(slugDone("welcome", [], extra)).toBe(true);
    expect(nextSlug("welcome")).toBe("approach");
    expect(previousSlug("welcome")).toBeNull();
    expect(nextSlug("review")).toBeNull();
  });
});

describe("texting registration", () => {
  const complete = Object.fromEntries(
    REGISTRATION_FIELDS.map((field) => [
      field.key,
      "kind" in field && field.kind === "email"
        ? "owner@example.com"
        : "kind" in field && field.kind === "url"
          ? "example.com"
          : "kind" in field && field.kind === "phone"
            ? "+1 415 555 0100"
            : field.key === "postal_code"
              ? "94110"
              : "Northside Fitness",
    ])
  );

  it("never has a field for the tax ID", () => {
    expect(REGISTRATION_FIELDS.some((field) => /ein|tax|ssn/i.test(field.key) || /tax id|ein\b/i.test(field.label))).toBe(false);
  });

  it("refuses a tax ID sent under any name", () => {
    const result = validateRegistration({ ...complete, ein: "12-3456789" });
    expect(result.ok).toBe(false);
    const named = validateRegistration({ ...complete, tax_id: "x" });
    expect(named.ok).toBe(false);
  });

  it("refuses a value shaped like a tax ID in an ordinary field", () => {
    const result = validateRegistration({ legal_name: "Acme 12-3456789" });
    expect(result.ok).toBe(false);
  });

  it("merges over what was saved, so fixing one field keeps the rest", () => {
    const first = validateRegistration(complete);
    expect(first.ok && first.complete).toBe(true);
    if (!first.ok) return;
    const fixed = validateRegistration({ website: "northside.example.com" }, first.details);
    expect(fixed.ok).toBe(true);
    if (!fixed.ok) return;
    expect(fixed.details.legal_name).toBe("Northside Fitness");
    expect(fixed.details.website).toBe("northside.example.com");
    expect(fixed.complete).toBe(true);
  });

  it("explains every rejection in plain words, with a fix", () => {
    for (const code of REJECTION_CODES) {
      expect(REJECTION_GUIDANCE[code].reason.length).toBeGreaterThan(10);
      expect(REJECTION_GUIDANCE[code].fix.length).toBeGreaterThan(10);
    }
  });
});

describe("lead import", () => {
  it("reads a CRM contact and carries do-not-contact over", () => {
    const contact = parseCrmContact({ id: "c1", firstName: "Ana", email: "ANA@EXAMPLE.COM", dndSettings: { SMS: { status: "active" } } });
    expect(contact?.email).toBe("ana@example.com");
    expect(contact?.doNotContact).toBe(true);
    expect(parseCrmContact({ firstName: "No id" })).toBeNull();
    expect(displayLabel({ firstName: null, lastName: null, email: null, phone: null })).toBe("A contact without a name");
  });

  it("names problems instead of failing", () => {
    const contact = parseCrmContact({ id: "c2", phone: "12", email: "not-an-email" })!;
    expect(problemsFor(contact)).toEqual(["invalid_phone", "invalid_email"]);
    expect(problemsFor(parseCrmContact({ id: "c3" })!)).toEqual(["no_contact_details"]);
  });

  it("keeps to the look-back window", () => {
    const start = new Date(NOW - 90 * DAY).toISOString();
    expect(inWindow(new Date(NOW - 10 * DAY).toISOString(), start)).toBe(true);
    expect(inWindow(new Date(NOW - 200 * DAY).toISOString(), start)).toBe(false);
  });

  it("gives full case files only to recently active leads that may be contacted", () => {
    const recent = parseCrmContact({ id: "a", lastActivity: new Date(NOW - 5 * DAY).toISOString() })!;
    const old = parseCrmContact({ id: "b", lastActivity: new Date(NOW - 60 * DAY).toISOString() })!;
    const dnd = parseCrmContact({ id: "c", dnd: true, lastActivity: new Date(NOW - 1 * DAY).toISOString() })!;
    expect(aiEligible(recent, 30, NOW)).toBe(true);
    expect(aiEligible(old, 30, NOW)).toBe(false);
    expect(aiEligible(dnd, 30, NOW)).toBe(false);
    expect(basicCaseFileSummary(dnd)).toMatch(/never draft a message/);
    expect(basicCaseFileSummary(recent)).toMatch(/basic case file/);
  });
});

describe("email domain records", () => {
  it("resolves names under the domain", () => {
    expect(lookupName("em123", "example.com")).toBe("em123.example.com");
    expect(lookupName("@", "example.com")).toBe("example.com");
    expect(lookupName("em123.example.com.", "example.com")).toBe("em123.example.com");
  });

  it("matches what DNS returns", () => {
    expect(recordMatches({ type: "TXT", host: "@", value: "v=spf1 include:mail.example.net" }, ["v=spf1 include:mail.example.net ~all"])).toBe(true);
    expect(recordMatches({ type: "CNAME", host: "em", value: "u1.mail.example.net." }, ["u1.mail.example.net"])).toBe(true);
    expect(recordMatches({ type: "MX", host: "@", value: "10 mx.example.net" }, ["20 mx.example.net"])).toBe(true);
    expect(recordMatches({ type: "CNAME", host: "em", value: "a.example.net" }, ["b.example.net"])).toBe(false);
    expect(readRecords([{ type: "A", host: "x", value: "1.2.3.4" }])).toEqual([]);
  });
});

describe("staged activation", () => {
  it("goes Scribe, Sentry, Relay, then Compass", () => {
    expect(ACTIVATION_ORDER).toEqual(["scribe", "sentry", "relay", "compass"]);
    const rows = readActivation([
      { agent: "relay", stage: "off", order: 3 },
      { agent: "scribe", stage: "on", order: 1 },
      { agent: "sentry", stage: "off", order: 2 },
      { agent: "nobody", stage: "on", order: 9 },
    ]);
    expect(rows).toHaveLength(3);
    expect(nextActivationStep(rows)).toBe("sentry");
    expect(nextActivationStep(rows.map((row) => ({ ...row, stage: "on" as const })))).toBeNull();
  });

  it("explains Sentry's watch period and that nothing is sent unapproved", () => {
    expect(activationStepCopy("sentry", 1).plain).toMatch(/first day/);
    expect(activationStepCopy("relay", 1).plain).toMatch(/Nothing is sent unless/);
    expect(activationStepCopy("compass", 1).plain).toMatch(/nothing happens until you confirm/);
  });
});

describe("first-week check-ins", () => {
  const facts: CheckinFacts = {
    since: new Date(NOW - 3 * DAY).toISOString(),
    alerts: { total: 4, acknowledged: 3, open: 1 },
    drafts: { total: 0, decided: 0, waiting: 0 },
    failedRuns: 1,
    connection: { crm: "active", openIssues: 0 },
    requestsUnanswered: 0,
    quietOperators: ["Sam"],
  };

  it("asks the six questions with answers from the facts", () => {
    const items = checkinItems(facts);
    expect(items).toHaveLength(6);
    expect(items.find((item) => item.key === "alerts")?.ok).toBe(true);
    expect(items.find((item) => item.key === "drafts")?.ok).toBeNull();
    expect(items.find((item) => item.key === "runs")?.ok).toBe(false);
    expect(items.find((item) => item.key === "connections")?.ok).toBe(true);
  });
});

describe("notices", () => {
  const label = (key: string | null) => (key === "crm" ? "Connect your CRM" : "setup");

  it("tells the Owner in plain words and stays quiet for staff-only events", () => {
    expect(ownerLine({ kind: "needs_you", stage_key: "crm", detail: null }, label)).toBe("Ready for you: Connect your CRM.");
    expect(ownerLine({ kind: "messaging_status", stage_key: null, detail: { status: "rejected" } }, label)).toMatch(/what to fix/);
    expect(ownerLine({ kind: "agent_on", stage_key: null, detail: { agent: "sentry", stage: "watch" } }, label)).toMatch(/tells nobody/);
    expect(ownerLine({ kind: "registration_saved", stage_key: null, detail: null }, label)).toBeNull();
  });

  it("tells staff to get the tax ID outside Vistrial", () => {
    expect(staffLine({ kind: "registration_saved", stage_key: null, detail: null }, label)).toMatch(/tax ID from them directly/);
  });
});

describe("onboarding queue", () => {
  const row = (overrides: Partial<QueueRow>): QueueRow => ({
    org_id: "o",
    name: "Northside",
    slug: "northside",
    org_status: "onboarding",
    phase: "setup",
    created_at: new Date(NOW - 10 * DAY).toISOString(),
    current_stage: "crm",
    current_stage_label: "CRM",
    waiting_on: "customer",
    waiting_since: new Date(NOW - 1 * DAY).toISOString(),
    stuck: false,
    stuck_reason: null,
    next_action: null,
    next_action_stage: null,
    done_count: 3,
    total_count: 16,
    owner_confirmed_at: null,
    go_live_approved_at: null,
    settled_at: null,
    assigned: [],
    template_name: null,
    updated_at: new Date(NOW).toISOString(),
    ...overrides,
  });

  it("rates risk: stuck, then review, then slow", () => {
    expect(queueRisk(row({ stuck: true }), NOW)).toBe("stuck");
    expect(queueRisk(row({ phase: "ready_for_review" }), NOW)).toBe("review");
    expect(queueRisk(row({ waiting_since: new Date(NOW - 4 * DAY).toISOString() }), NOW)).toBe("slow");
    expect(queueRisk(row({}), NOW)).toBe("fine");
    expect(queueRisk(row({ waiting_on: "nobody", waiting_since: new Date(NOW - 9 * DAY).toISOString() }), NOW)).toBe("fine");
  });

  it("filters and sorts stuck first", () => {
    const rows = [
      row({ org_id: "a", name: "Alpha" }),
      row({ org_id: "b", name: "Bravo", stuck: true }),
      row({ org_id: "c", name: "Charlie", phase: "ready_for_review", assigned: [{ user_id: "me", name: "Me" }] }),
    ];
    expect(sortQueue(rows, NOW).map((item) => item.org_id)).toEqual(["b", "c", "a"]);
    const mine = readQueueFilters({ mine: "1" });
    expect(filterQueue(rows, mine, "me", NOW).map((item) => item.org_id)).toEqual(["c"]);
    expect(filterQueue(rows, readQueueFilters({ q: "brav" }), "me", NOW).map((item) => item.org_id)).toEqual(["b"]);
    expect(filterQueue(rows, readQueueFilters({ risk: "stuck" }), "me", NOW)).toHaveLength(1);
  });

  it("ignores unknown filter values", () => {
    const filters = readQueueFilters({ phase: "nonsense", waiting: "x", risk: "<script>", q: " north " });
    expect(queueParams(filters)).toEqual({ q: "north" });
  });
});

describe("sample states for the layout reference", () => {
  it("gives every state all sixteen stages, readable as real steps", () => {
    for (const state of SAMPLE_STATES) {
      const view = sampleCustomerView(state.id, NOW);
      expect(readSteps(view.steps), state.id).toHaveLength(16);
    }
    expect(sampleCustomerView("blocked", NOW).steps.find((item) => item.key === "crm")?.state).toBe("blocked");
    expect(sampleCustomerView("review", NOW).phase).toBe("ready_for_review");
  });
});

describe("customer-facing copy", () => {
  const OTHER_COMPANIES = /gohighlevel|highlevel|leadconnector|telnyx|twilio|stripe|sendgrid|openai|anthropic/i;

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : [full];
    });
  }

  it("never names another company in the new setup screens", () => {
    const screens = [
      ...files(path.join(ROOT, "src/app/(workspace)/app/onboarding/step")),
      path.join(ROOT, "src/app/(workspace)/app/onboarding/page.tsx"),
      path.join(ROOT, "src/app/(workspace)/app/onboarding/setup-frame.tsx"),
      path.join(ROOT, "src/app/(workspace)/app/onboarding/setup-ui.tsx"),
      path.join(ROOT, "src/app/(workspace)/app/onboarding/progress/page.tsx"),
      path.join(ROOT, "src/lib/onboarding/invite-email.ts"),
    ];
    for (const file of screens) {
      const visible = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(import|\/\/|\*)/.test(line) && !/href=|\/api\//.test(line));
      expect(visible.filter((line) => OTHER_COMPANIES.test(line)), file).toEqual([]);
    }
  });
});
