import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("light operator app, dark public site", () => {
  it("keeps html light and wraps marketing in .dark", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('colorScheme: "light"');
    expect(layout).toContain('themeColor: "#f6f5fb"');
    expect(layout).not.toMatch(/className=\{cn\(\s*"dark"/);

    const marketing = readFileSync(
      path.join(process.cwd(), "src/app/(marketing)/layout.tsx"),
      "utf8",
    );
    expect(marketing).toContain('className="dark min-h-screen bg-background text-foreground"');
  });

  it("uses the black Vistrial mark on operator, portal, stellar, and auth", () => {
    const logo = readFileSync(path.join(process.cwd(), "src/components/brand/logo.tsx"), "utf8");
    expect(logo).toContain('tone?: "silver" | "current" | "on-light"');
    expect(logo).toContain("/brand/Vistrial Black Logo");
    expect(
      existsSync(path.join(process.cwd(), "public/brand/Vistrial Black Logo")),
    ).toBe(true);

    for (const file of [
      "src/components/app/app-shell.tsx",
      "src/app/portal/layout.tsx",
      "src/app/stellar/layout.tsx",
      "src/components/auth/auth-card.tsx",
    ]) {
      expect(readFileSync(path.join(process.cwd(), file), "utf8")).toContain('tone="on-light"');
    }
  });

  it("leaves the last token block light on :root and dark on .dark", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const lastRoot = css.lastIndexOf(":root {");
    const lastDark = css.lastIndexOf(".dark {");
    expect(lastRoot).toBeGreaterThan(0);
    expect(lastDark).toBeGreaterThan(lastRoot);
    expect(css.slice(lastRoot, lastDark)).toContain("--page: #f6f5fb");
    expect(css.slice(lastDark)).toContain("--page: #07070b");
    expect(css).toContain("--primary: #9a88fc");
  });
});
