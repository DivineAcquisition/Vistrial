import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CATALOG } from "../catalog";
import { agentWork, workLabel, workOutput } from "./workWords";

const SKILL_NAMES = CATALOG.flatMap((agent) => agent.skills.map((skill) => skill.name));

/** Files under a folder, skipping the ones the rule does not cover. */
function files(dir: string, skip: (file: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (skip(full)) return [];
    if (statSync(full).isDirectory()) return files(full, skip);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** The code of a file without its comments: a comment may name a skill, a screen may not. */
function code(file: string) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("work words", () => {
  it("words every skill in the catalog, Dealmaker's and later agents' included", () => {
    for (const agent of CATALOG) {
      for (const skill of agent.skills) {
        expect(skill.work, skill.slug).not.toBe("Work");
        expect(skill.output, skill.slug).toMatch(/^(a|an) /);
        expect(skill.work).not.toBe(skill.name);
      }
    }
  });

  it("labels work by its agent and what it does", () => {
    expect(agentWork("growth-architect", "market-intelligence")).toBe("Strategist · Research");
    expect(agentWork(null, "creative-production")).toBe("Strategist · Ads");
    expect(agentWork("growth-architect", null)).toBe("Strategist");
    expect(workLabel("landing-page-teardown")).toBe("Page breakdown");
    expect(workOutput("offer-intelligence")).toBe("an offer analysis");
    expect(workLabel("unknown")).toBe("Work");
  });

  it("never names a skill on a signed-in screen", () => {
    const root = path.resolve(__dirname, "../..");
    const skip = (file: string) => /[\\/](marketing|\(marketing\)|dev|node_modules)$/.test(file) || /[\\/]lib[\\/]marketing$/.test(file);
    const screens = [...files(path.join(root, "src/components"), skip), ...files(path.join(root, "src/app/(product)"), skip), ...files(path.join(root, "src/lib"), skip)];
    const found = screens.flatMap((file) => SKILL_NAMES.filter((name) => code(file).includes(name)).map((name) => `${path.relative(root, file)}: ${name}`));
    expect(found).toEqual([]);
  });
});
