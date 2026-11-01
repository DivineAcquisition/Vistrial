import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname);

/** Every Convex module, as the generated api names it: "runs", "lib/access", and so on. */
function modules(dir = root, prefix = ""): string[] {
  return readdirSync(path.join(dir), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return entry.name === "_generated" ? [] : modules(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts") || entry.name.endsWith(".d.ts")) return [];
    if (entry.name === "schema.ts" || entry.name === "auth.config.ts") return [];
    return [`${prefix}${entry.name.slice(0, -3)}`];
  });
}

describe("generated Convex code", () => {
  // `convex deploy` regenerates this at build time, but only after `next build` has run against the
  // committed copy. A stale copy hides type errors, so it must list exactly the modules that exist.
  it("lists exactly the modules in convex/", () => {
    const generated = readFileSync(path.join(root, "_generated/api.d.ts"), "utf8");
    const listed = [...generated.matchAll(/from "\.\.\/(.+)\.js";/g)].map((match) => match[1]).sort();
    expect(listed).toEqual(modules().sort());
  });
});
