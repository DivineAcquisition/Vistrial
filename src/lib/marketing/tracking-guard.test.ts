import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { GA_ID_PATTERN, META_PIXEL_PATTERN } from "@/lib/marketing/tracking-ids";

function filesUnder(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesUnder(path, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(path);
  }
  return acc;
}

describe("tracking stays registered", () => {
  it("rejects measurement ids that are not a Google Analytics 4 id or a numeric Meta pixel", () => {
    expect(GA_ID_PATTERN.test("G-ABC123")).toBe(true);
    expect(GA_ID_PATTERN.test("UA-1")).toBe(false);
    expect(GA_ID_PATTERN.test("https://evil.example")).toBe(false);
    expect(META_PIXEL_PATTERN.test("1234567890")).toBe(true);
    expect(META_PIXEL_PATTERN.test("pixel.js")).toBe(false);
  });

  it("does not reference Google or Meta tracking outside the public loader", () => {
    const allowed = new Set([
      "src/components/marketing/tracking-scripts.tsx",
    ]);
    const hits: string[] = [];
    for (const file of filesUnder("src")) {
      const rel = file.replace(/\\/g, "/").replace(/^.*\/src\//, "src/");
      if (allowed.has(rel) || rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      const text = readFileSync(file, "utf8");
      if (/googletagmanager\.com|connect\.facebook\.net|fbq\(/.test(text)) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });
});
