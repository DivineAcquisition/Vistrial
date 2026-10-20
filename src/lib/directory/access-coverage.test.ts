import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ROLE_RENAMES } from "@/lib/directory/seat-map";

const FILES = [
  "convex/directory.ts",
  "convex/importDirectory.ts",
  "convex/live.ts",
  "convex/importLive.ts",
  "convex/record.ts",
  "convex/pause.ts",
  "convex/leadAccess.ts",
  "convex/notify.ts",
  "convex/privacy.ts",
];

describe("directory functions call the access check", () => {
  it("starts every Convex function with requireAccess", () => {
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      const handlers = source.split("handler: async").slice(1);
      expect(handlers.length).toBeGreaterThan(0);
      for (const handler of handlers) {
        const body = handler.slice(0, 500);
        expect(body, file).toContain("requireAccess(");
      }
    }
  });

  it("keeps the placed-operator rename exact", () => {
    expect(ROLE_RENAMES).toEqual({ da_operator: "placed_operator" });
  });
});
