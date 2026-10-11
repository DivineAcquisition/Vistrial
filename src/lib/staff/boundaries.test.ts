import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("staff boundaries", () => {
  it("does not put team notes in a customer export", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/ops/export.ts"), "utf8");
    expect(source).not.toContain('from("staff_notes")');
    expect(source).not.toContain('from("staff_item_notes")');
  });
});
