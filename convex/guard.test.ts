import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { guardViolations, type GuardFile } from "./lib/guard";
import { leadBuilderViolations } from "./lib/leadGuard";

function filesUnder(dir: string): GuardFile[] {
  const out: GuardFile[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (name.endsWith(".ts")) out.push({ path: full, source: readFileSync(full, "utf8") });
  }
  return out;
}

describe("access builder guard", () => {
  it("fails when a file exports a plain query, mutation, or action", () => {
    const bad = guardViolations([
      {
        path: "convex/open.ts",
        source: `import { query } from "./_generated/server";\nexport const list = query({ args: {}, handler: async () => [] });\n`,
      },
      {
        path: "convex/open-write.ts",
        source: `import { mutation as write } from "./_generated/server";\nexport const save = write({ args: {}, handler: async () => null });\n`,
      },
    ]);
    expect(bad.length).toBeGreaterThan(0);

    const internalOnly = guardViolations([
      {
        path: "convex/hidden.ts",
        source: `import { internalMutation } from "./_generated/server";\nexport const enroll = internalMutation({ args: {}, handler: async () => null });\n`,
      },
    ]);
    expect(internalOnly).toEqual([]);
  });

  it("finds no plain query, mutation, or action in convex/", () => {
    const violations = guardViolations(filesUnder(path.join(process.cwd(), "convex")));
    expect(violations).toEqual([]);
  });

  it("requires a lead builder when a function takes a lead-scoped id", () => {
    const bad = leadBuilderViolations([
      {
        path: "convex/openLead.ts",
        source: `export const get = workspaceQuery({\n  args: { leadId: v.id("leads") },\n  handler: async () => null,\n});\n`,
      },
    ]);
    expect(bad.length).toBeGreaterThan(0);
    const tree = filesUnder(path.join(process.cwd(), "convex"));
    expect(leadBuilderViolations(tree)).toEqual([]);
    const leads = readFileSync(path.join(process.cwd(), "convex/leads.ts"), "utf8");
    const records = readFileSync(path.join(process.cwd(), "convex/records.ts"), "utf8");
    const imports = readFileSync(path.join(process.cwd(), "convex/imports.ts"), "utf8");
    expect(leads).not.toContain(".filter(");
    expect(records).not.toContain(".filter(");
    expect(imports).not.toContain(".filter(");
    const schemaSource = readFileSync(path.join(process.cwd(), "convex/schema.ts"), "utf8");
    expect(schemaSource).toContain('index("by_workspace_owner_activity"');
    expect(schemaSource).toContain('index("by_workspace_lead_at", ["workspaceId", "leadId", "at"])');
  });
});
