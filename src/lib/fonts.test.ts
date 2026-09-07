import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("product typeface", () => {
  it("loads only Inter Display and Geist Mono", () => {
    const fonts = readFileSync(path.join(process.cwd(), "src/lib/fonts.ts"), "utf8");
    expect(fonts).toContain("interDisplay");
    expect(fonts).toContain("InterVariable");
    expect(fonts).toContain("'opsz' 32");
    expect(fonts).not.toMatch(/Instrument_Serif/);
    expect(fonts).not.toMatch(/Plus_Jakarta/);
    expect(fonts).not.toMatch(/instrumentSerif/);
  });

  it("uses Inter Display for landing headlines and the operator app", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/--font-heading:\s*var\(--font-sans\)/);
    expect(css).toMatch(/--font-display:\s*var\(--font-sans\)/);
    expect(css).not.toMatch(/--font-display:\s*var\(--font-serif\)/);

    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("interDisplay.variable");
    expect(layout).not.toMatch(/instrumentSerif/);
  });
});
