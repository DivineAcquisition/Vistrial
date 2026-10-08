import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("one dark theme, everywhere", () => {
  it("puts .dark on <html> so no route can opt out", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('colorScheme: "dark"');
    expect(layout).toContain('themeColor: "#07070b"');
    expect(layout).toMatch(/className=\{cn\(\s*"dark"/);

    // global-error.tsx renders its own <html>, so it carries the class itself.
    expect(read("src/app/global-error.tsx")).toContain('cn("dark"');
  });

  it("stops wrapping marketing in its own .dark", () => {
    const marketing = read("src/app/(marketing)/layout.tsx");
    expect(marketing).toContain('className="min-h-screen bg-background text-foreground"');
  });

  it("serves the silver Vistrial mark on every surface", () => {
    const logo = read("src/components/brand/logo.tsx");
    expect(logo).not.toContain("on-light");
    expect(logo).not.toContain("Vistrial Black Logo");

    for (const file of [
      "src/components/app/app-shell.tsx",
      "src/components/app/app-sidebar.tsx",
      "src/app/(workspace)/portal/layout.tsx",
      "src/app/stellar/layout.tsx",
      "src/app/(workspace)/app/home/page.tsx",
      "src/components/auth/auth-card.tsx",
    ]) {
      expect(read(file)).not.toContain("tone=");
    }
  });

  it("gives :root and .dark the same palette so source order cannot change it", () => {
    const css = read("src/app/globals.css");

    const selector = ":root,\n.dark {";
    const combined = css.lastIndexOf(selector);
    expect(combined).toBeGreaterThan(0);
    // Nothing may redefine the palette after the combined block, since :root
    // and .dark share a specificity and the later rule would win.
    const after = combined + selector.length;
    expect(css.indexOf(":root {", after)).toBe(-1);
    expect(css.indexOf(".dark {", after)).toBe(-1);

    const palette = css.slice(combined);
    expect(palette).toContain("color-scheme: dark");
    expect(palette).toContain("--page: #07070b");
    expect(palette).toContain("--background: #07070b");
    expect(palette).toContain("--card: #0b0a11");
    expect(palette).toContain("--card-foreground: #ffffff");
    expect(palette).toContain("--primary: #9a88fc");
    expect(palette).toContain("--color-silver: #a3a3a3");
    expect(palette).not.toContain("#f6f5fb");
  });

  it("keeps no light-mode escape hatches in the stylesheet", () => {
    const css = read("src/app/globals.css");
    expect(css).not.toContain("html:not(.dark)");
    expect(css).not.toContain("color-scheme: light");
  });
});
