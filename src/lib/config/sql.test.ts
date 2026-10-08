import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCK_BEGIN, BLOCK_END, generateConfigSql } from "./sql";

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");

// The database copy of the field registry and seeded templates must match the
// TypeScript registry. When the registry changes, add a new migration with the
// output of `node scripts/gen-config-sql.mjs` (shipped migrations stay as they are).
describe("generated configuration SQL", () => {
  it("matches the newest migration that carries the registry block", () => {
    const latest = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .reverse()
      .map((name) => readFileSync(path.join(MIGRATIONS, name), "utf8"))
      .find((sql) => sql.includes(BLOCK_BEGIN));
    expect(latest, "no migration carries the configuration registry block").toBeDefined();

    const start = latest!.indexOf(BLOCK_BEGIN);
    const end = latest!.indexOf(BLOCK_END, start) + BLOCK_END.length;
    expect(latest!.slice(start, end)).toBe(generateConfigSql().trim());
  });
});
