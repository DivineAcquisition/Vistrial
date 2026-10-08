import { describe, expect, it } from "vitest";

import {
  CONFIG_FIELDS,
  FIELD_BY_KEY,
  LAUNCH_COMPLIANCE_CHANGE,
  registryPlatformLocks,
  registryPlatformValues,
} from "@/lib/config/registry";
import { diffValues, resolveConfig, sparseOverrides, versionStamp } from "@/lib/config/resolve";
import { COACHES_CONSULTANTS, HOME_SERVICES, MED_SPA, SEED_TEMPLATES } from "@/lib/config/seeds";
import { isAtLeastAsStrict } from "@/lib/config/tighten";
import { looksLikeSecret, validateFieldValue, validateLayerValues } from "@/lib/config/validate";
import type { LayerSnapshot } from "@/lib/config/types";

const platform = (): LayerSnapshot => ({
  values: { ...registryPlatformValues(), ...LAUNCH_COMPLIANCE_CHANGE.values },
  lockedKeys: registryPlatformLocks(),
  version: 2,
});

const identity = {
  "identity.business_name": "Glow Studio LLC",
  "identity.display_name": "Glow Studio",
  "identity.primary_contact": { name: "Maya Lee", email: "maya@glow.example", phone: "+1 555 123 4567" },
};

describe("registry", () => {
  it("has unique keys, help text for every field, and keys that match their section", () => {
    const keys = CONFIG_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const field of CONFIG_FIELDS) {
      expect(field.key.startsWith(`${field.section}.`)).toBe(true);
      expect(field.help.length).toBeGreaterThan(10);
    }
  });

  it("has valid platform defaults", () => {
    for (const field of CONFIG_FIELDS) {
      if (field.platformDefault === undefined) continue;
      expect(validateFieldValue(field, field.platformDefault), field.key).toEqual([]);
    }
  });

  it("locks every compliance rule at the platform by default", () => {
    const compliance = CONFIG_FIELDS.filter((field) => field.section === "compliance").map((field) => field.key);
    expect(registryPlatformLocks()).toEqual(expect.arrayContaining(compliance));
  });
});

describe("seeded templates", () => {
  it.each(SEED_TEMPLATES.map((template) => [template.name, template] as const))(
    "%s produces a complete, valid workspace configuration",
    (_name, template) => {
      const effective = resolveConfig({
        platform: platform(),
        template: { slug: template.slug, values: template.values, lockedKeys: [], version: 1 },
        workspace: { values: identity, lockedKeys: [], version: 1 },
      });
      expect(effective.issues).toEqual([]);
    }
  );

  it.each(SEED_TEMPLATES.map((template) => [template.name, template] as const))(
    "%s passes validation on its own, without workspace-only fields",
    (_name, template) => {
      expect(validateLayerValues(template.values, { level: "template" })).toEqual([]);
      const effective = resolveConfig({
        platform: platform(),
        template: { slug: template.slug, values: template.values, lockedKeys: [], version: 1 },
        workspace: null,
        includeWorkspaceOnly: false,
      });
      expect(effective.issues).toEqual([]);
    }
  );

  it("differ from one another where the industries differ", () => {
    expect(MED_SPA.values["response.first_touch_minutes"]).toBeLessThan(
      COACHES_CONSULTANTS.values["response.first_touch_minutes"] as number
    );
    expect(HOME_SERVICES.values["industry.urgency_signals"]).toContain("leak");
  });
});

describe("resolution", () => {
  const template = { slug: "med-spa", values: MED_SPA.values, lockedKeys: [] as string[], version: 3 };

  it("prefers the workspace, then the template, then the platform default, and says where each came from", () => {
    const effective = resolveConfig({
      platform: platform(),
      template,
      workspace: { values: { ...identity, "response.first_touch_minutes": 3 }, lockedKeys: [], version: 7 },
    });
    expect(effective.fields["response.first_touch_minutes"]).toMatchObject({ value: 3, source: "workspace" });
    expect(effective.fields["tone.formality"]).toMatchObject({ value: "friendly", source: "template" });
    expect(effective.fields["tone.use_contractions"]).toMatchObject({ value: true, source: "platform" });
    expect(effective.version).toBe("p2/2.t:med-spa@3/3.w7");
  });

  it("ignores a workspace override of a locked field and explains why", () => {
    const effective = resolveConfig({
      platform: platform(),
      template,
      workspace: { values: { ...identity, "compliance.quiet_hours_basis": "workspace" }, lockedKeys: [], version: 1 },
    });
    expect(effective.fields["compliance.quiet_hours_basis"]).toMatchObject({
      value: "lead_local",
      source: "platform",
      lockedAt: "platform",
    });
    expect(effective.fields["compliance.quiet_hours_basis"].ignoredOverride?.level).toBe("workspace");
  });

  it("lets a workspace tighten a locked compliance rule but never loosen it", () => {
    const tighter = resolveConfig({
      platform: platform(),
      template,
      workspace: {
        values: { ...identity, "compliance.daily_cap_per_lead": 1, "compliance.quiet_hours": { start: "19:00", end: "09:00" } },
        lockedKeys: [],
        version: 1,
      },
    });
    expect(tighter.fields["compliance.daily_cap_per_lead"]).toMatchObject({ value: 1, source: "workspace", tightened: true });
    expect(tighter.fields["compliance.quiet_hours"]).toMatchObject({ source: "workspace", tightened: true });

    const looser = resolveConfig({
      platform: platform(),
      template,
      workspace: { values: { ...identity, "compliance.daily_cap_per_lead": 5 }, lockedKeys: [], version: 1 },
    });
    expect(looser.fields["compliance.daily_cap_per_lead"]).toMatchObject({ value: 2, source: "platform" });
  });

  it("refuses to save a looser locked value or an unknown key", () => {
    const issues = validateLayerValues(
      { "compliance.daily_cap_per_lead": 5, "not.a.field": 1 },
      { level: "workspace", inheritedLocked: { "compliance.daily_cap_per_lead": 2 } }
    );
    expect(issues.map((issue) => issue.key).sort()).toEqual(["compliance.daily_cap_per_lead", "not.a.field"]);
  });

  it("reports missing required fields in plain language", () => {
    const effective = resolveConfig({ platform: platform(), template: null, workspace: null });
    const missing = effective.issues.filter((issue) => issue.kind === "missing").map((issue) => issue.key);
    expect(missing).toEqual(
      expect.arrayContaining(["identity.business_name", "qualification.ready_criteria", "industry.offers", "industry.case_facts"])
    );
    for (const issue of effective.issues) expect(issue.message).toMatch(/[.?!]["\u201d]?$/);
  });

  it("takes unlocked fields from the pinned version and locked fields from the current one", () => {
    const pinned = platform();
    const current = {
      ...pinned,
      version: 3,
      values: { ...pinned.values, "tone.emoji": "natural", "compliance.daily_cap_per_lead": 1 },
    };
    const effective = resolveConfig({
      platform: pinned,
      platformCurrent: current,
      template,
      workspace: { values: identity, lockedKeys: [], version: 1 },
    });
    expect(effective.fields["tone.emoji"]).toMatchObject({ value: "sparing", source: "template" });
    expect(effective.fields["compliance.daily_cap_per_lead"]).toMatchObject({ value: 1, source: "platform" });
    expect(effective.version).toBe("p2/3.t:med-spa@3/3.w1");
  });

  it("stores only what differs from the inherited value", () => {
    const { set, unchanged } = sparseOverrides(
      { "tone.formality": "friendly", "response.first_touch_minutes": 2 },
      { "tone.formality": "friendly", "response.first_touch_minutes": 5 }
    );
    expect(set).toEqual({ "response.first_touch_minutes": 2 });
    expect(unchanged).toEqual(["tone.formality"]);
  });

  it("diffs two versions field by field", () => {
    expect(diffValues({ a: 1, b: [1] }, { a: 1, b: [1, 2], c: "x" })).toEqual([
      { key: "b", before: [1], after: [1, 2] },
      { key: "c", before: undefined, after: "x" },
    ]);
  });

  it("stamps the version from the levels that produced it", () => {
    expect(versionStamp({ platform: platform(), template: null, workspace: null })).toBe("p2/2.t:none.w0");
  });
});

describe("validation", () => {
  it("catches cross-field problems with fix-it messages", () => {
    const effective = resolveConfig({
      platform: platform(),
      template: { slug: "x", values: MED_SPA.values, lockedKeys: [], version: 1 },
      workspace: {
        values: {
          ...identity,
          "qualification.factor_weights": { timeline: 50, investment_capacity: 30, decision_authority: 20, pain_severity: 15 },
          "qualification.ready_threshold": 55,
          "response.ghost_days_soft": 10,
          "response.ghost_days_hard": 5,
          "response.first_touch_minutes": 600,
          "qualification.minimum_info": ["shoe_size"],
        },
        lockedKeys: [],
        version: 1,
      },
    });
    const messages = effective.issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("add up to 115");
    expect(messages).toContain("no score band starts there");
    expect(messages).toContain("must be longer than");
    expect(messages).toContain("should always come sooner");
    expect(messages).toContain("\"shoe_size\"");
  });

  it("will not let an action that reaches people proceed without approval", () => {
    const actions = (FIELD_BY_KEY["approval.actions"].platformDefault as Array<Record<string, unknown>>).map((row) =>
      row.action === "send_text" ? { ...row, mode: "auto_run", auto_run_confirmed: true } : row
    );
    const effective = resolveConfig({
      platform: platform(),
      template: { slug: "x", values: MED_SPA.values, lockedKeys: [], version: 1 },
      workspace: { values: { ...identity, "approval.actions": actions as never }, lockedKeys: [], version: 1 },
    });
    expect(effective.issues.map((issue) => issue.message).join("\n")).toContain("always needs approval");
  });

  it("refuses anything that looks like a credential", () => {
    expect(looksLikeSecret("https://hooks.slack.com/services/T000/B000/XXXX")).toBe(true);
    expect(looksLikeSecret("sk_live_abcdefghijklmnop")).toBe(true);
    expect(looksLikeSecret("Reply STOP to opt out")).toBe(false);
    expect(validateFieldValue(FIELD_BY_KEY["integrations.file_folder"], "xoxb-1234567890-abcdef")).toHaveLength(1);
  });

  it("rejects quiet hours that cover the whole day", () => {
    expect(validateFieldValue(FIELD_BY_KEY["compliance.quiet_hours"], { start: "20:00", end: "20:00" })).toHaveLength(1);
  });
});

describe("tighten rules", () => {
  it("compares windows, lists, and numbers", () => {
    expect(isAtLeastAsStrict("wider_window", { start: "20:00", end: "08:00" }, { start: "19:30", end: "08:30" })).toBe(true);
    expect(isAtLeastAsStrict("wider_window", { start: "20:00", end: "08:00" }, { start: "21:00", end: "08:00" })).toBe(false);
    expect(isAtLeastAsStrict("superset_list", ["STOP"], ["stop", "QUIT"])).toBe(true);
    expect(isAtLeastAsStrict("superset_list", ["STOP", "QUIT"], ["STOP"])).toBe(false);
    expect(isAtLeastAsStrict("lower_number_zero_is_unlimited", 0, 5)).toBe(true);
    expect(isAtLeastAsStrict("lower_number_zero_is_unlimited", 5, 0)).toBe(false);
  });
});
