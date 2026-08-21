import { describe, expect, it } from "vitest";

import { postAuthPath } from "@/lib/auth/paths";
import {
  ACTIVATION_OVERRIDE_PHRASE,
  HARD_REQUIREMENT_IDS,
  SETUP_STEPS,
  SPEED_TO_LEAD_WIDE_MINUTES,
  WARNING_IDS,
} from "@/lib/onboarding/constants";
import { applicableWarnings, parseActivationGate, parseOrgSetupState, unmetHard } from "@/lib/onboarding/gate";
import { parseSetupStep } from "@/lib/onboarding/steps";
import { parseFirstWeekHealth } from "@/lib/onboarding/week-parse";

describe("setup step locking", () => {
  const steps = [
    { id: "organization" as const, complete: true, locked: false },
    { id: "crm" as const, complete: false, locked: false },
    { id: "backfill" as const, complete: false, locked: true },
    { id: "field_mapping" as const, complete: false, locked: true },
    { id: "scoring" as const, complete: false, locked: true },
    { id: "team" as const, complete: false, locked: true },
    { id: "transcripts" as const, complete: false, locked: true },
    { id: "voice" as const, complete: false, locked: true },
    { id: "review" as const, complete: false, locked: true },
  ];

  it("refuses a later locked step and returns the first open one", () => {
    expect(parseSetupStep("review", steps)).toBe("crm");
    expect(parseSetupStep("field_mapping", steps)).toBe("crm");
  });

  it("allows the current unlocked step", () => {
    expect(parseSetupStep("crm", steps)).toBe("crm");
  });
});

describe("activation gate parsing", () => {
  it("requires acknowledgment only for warnings that apply", () => {
    const gate = parseActivationGate({
      org_id: "org-1",
      activated_at: null,
      can_activate: false,
      member_count: 1,
      voice_example_count: 0,
      transcript_choice: null,
      baseline_fallback: null,
      last_visited_step: "review",
      hard: HARD_REQUIREMENT_IDS.map((id) => ({
        id,
        ok: id !== "crm_verified",
        label: id,
        fix_step: "crm",
        detail: null,
      })),
      warnings: WARNING_IDS.map((id) => ({
        id,
        applies: id === "no_voice_examples" || id === "thin_team",
        label: id,
        consequence: "stated",
      })),
    });
    expect(gate).not.toBeNull();
    expect(unmetHard(gate!).map((item) => item.id)).toEqual(["crm_verified"]);
    expect(applicableWarnings(gate!).map((item) => item.id)).toEqual(["no_voice_examples", "thin_team"]);
  });
});

describe("setup state order", () => {
  it("keeps the nine steps in dependency order", () => {
    const parsed = parseOrgSetupState({
      org: { id: "o", name: "N", slug: "n", timezone: "UTC", activated_at: null },
      last_visited_step: "organization",
      gate: {
        org_id: "o",
        can_activate: false,
        hard: [],
        warnings: [],
        member_count: 1,
        voice_example_count: 0,
        last_visited_step: "organization",
      },
      steps: SETUP_STEPS.map((id, index) => ({
        id,
        complete: false,
        locked: index > 0,
      })),
      backfill: null,
    });
    expect(parsed?.steps.map((step) => step.id)).toEqual([...SETUP_STEPS]);
  });
});

describe("first week health", () => {
  it("parses counts without inventing a completion percentage", () => {
    const health = parseFirstWeekHealth({
      activated_at: "2026-08-01T00:00:00Z",
      hours_since_activation: 30,
      zero_ingest_warning: true,
      leads_ingested: 0,
      touch_coverage: { k: 0, n: 0 },
      outcome_logging_rate: { k: 0, n: 0 },
      drafts: { approved: 2, rejected: 1 },
      unmatched_transcripts: { count: 3, oldest_received_at: "2026-08-20T00:00:00Z" },
      bypass: "Leads are arriving but no human touches are logged.",
    });
    expect(health?.zeroIngestWarning).toBe(true);
    expect(health?.drafts).toEqual({ approved: 2, rejected: 1 });
    expect(health?.bypass).toMatch(/no human touches/i);
    expect(JSON.stringify(health)).not.toMatch(/streak|badge|gamif/i);
  });
});

describe("auth paths", () => {
  it("keeps staff console paths after sign-in", () => {
    expect(postAuthPath("/ops")).toBe("/ops");
    expect(postAuthPath("/ops/orgs/abc")).toBe("/ops/orgs/abc");
  });
});

describe("activation constants", () => {
  it("names the override phrase and the wide speed-to-lead window", () => {
    expect(ACTIVATION_OVERRIDE_PHRASE).toBe("ACTIVATE");
    expect(SPEED_TO_LEAD_WIDE_MINUTES).toBe(60);
  });
});
