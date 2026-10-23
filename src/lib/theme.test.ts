import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(process.cwd(), dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(process.cwd(), rel)).isDirectory()) out.push(...filesUnder(rel));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** Surfaces that are always dark: the public site and the auth desk. */
const ALWAYS_DARK = [
  "src/components/marketing/",
  "src/app/(marketing)/",
  "src/lib/marketing/",
  "src/components/auth/",
];

/** Third-party demos that carry their own light and dark pairs. */
const DEMOS = ["src/components/sidebar-demo.tsx", "src/components/glowing-effect-demo.tsx", "src/components/ui/aceternity-sidebar.tsx"];

describe("a white workspace with a dark theme a person can choose", () => {
  it("leaves .dark off <html> and lets the head script add it before paint", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("THEME_SCRIPT");
    expect(layout).toContain("themeColor: THEME_COLOR.light");
    expect(layout).toContain("suppressHydrationWarning");
    expect(layout).not.toMatch(/className=\{cn\(\s*"dark"/);

    const theme = read("src/lib/theme.ts");
    expect(theme).toContain('light: "#ffffff"');
    expect(theme).toContain('dark: "#07070b"');

    // global-error.tsx renders its own <html> with no script, so it stays dark.
    expect(read("src/app/global-error.tsx")).toContain('cn("dark"');
  });

  it("keeps the public site dark", () => {
    const layout = read("src/app/(marketing)/layout.tsx");
    expect(layout).toMatch(/className="dark /);
    expect(layout).toContain("<ForceDarkTheme />");
  });

  it("puts the theme switch on the workspace shell and the staff page", () => {
    expect(read("src/components/shell/product-shell.tsx")).toContain("<ThemeToggle />");
    expect(read("src/app/(product)/admin/page.tsx")).toContain("<ThemeToggle />");
  });

  it("serves the ink mark on white and the silver mark on dark", () => {
    const logo = read("src/components/brand/logo.tsx");
    expect(logo).toContain("/brand/vistrial-lockup-ink.png");
    expect(logo).toContain("/brand/vistrial-crest-ink.png");
    expect(logo).toContain('"dark:hidden!"');
    expect(logo).toContain('"not-dark:hidden!"');
    expect(logo).not.toContain("Vistrial Black Logo");

    for (const file of [
      "src/components/shell/product-shell.tsx",
      "src/app/(product)/admin/page.tsx",
      "src/components/auth/auth-card.tsx",
    ]) {
      expect(read(file)).not.toContain("tone=");
    }
  });

  it("defines the light palette on :root and the dark one on .dark, last in the file", () => {
    const css = read("src/app/globals.css");
    const light = css.lastIndexOf("\n:root {");
    const dark = css.lastIndexOf("\n.dark {");
    expect(light).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(light);
    // :root and .dark share a specificity, so a later block would win.
    expect(css.indexOf(":root", dark)).toBe(-1);
    expect(css.indexOf(".dark {", dark + 2)).toBe(-1);

    const lightPalette = css.slice(light, dark);
    expect(lightPalette).toContain("color-scheme: light");
    expect(lightPalette).toContain("--page: #ffffff");
    expect(lightPalette).toContain("--background: #ffffff");
    expect(lightPalette).toContain("--primary: #9a88fc");
    expect(lightPalette).toContain("--primary-foreground: #07070b");
    expect(lightPalette).toContain("--strong: #0b0a11");

    const darkPalette = css.slice(dark);
    expect(darkPalette).toContain("color-scheme: dark");
    expect(darkPalette).toContain("--page: #07070b");
    expect(darkPalette).toContain("--background: #07070b");
    expect(darkPalette).toContain("--card: #0b0a11");
    expect(darkPalette).toContain("--card-foreground: #ffffff");
    expect(darkPalette).toContain("--primary: #9a88fc");
    expect(darkPalette).toContain("--color-silver: #a3a3a3");
    expect(darkPalette).toContain("--strong: #ffffff");
  });

  it("writes workspace colour through theme tokens, not hard-coded white", () => {
    const offenders: string[] = [];
    for (const file of [...filesUnder("src/app"), ...filesUnder("src/components"), ...filesUnder("src/lib")]) {
      if (ALWAYS_DARK.some((prefix) => file.startsWith(prefix)) || DEMOS.includes(file)) continue;
      const source = read(file);
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (/(?<![\w-])(bg|border|ring|divide)-white\//.test(line)) offenders.push(`${file}:${index + 1}`);
        // White type is right only on a filled destructive button.
        if (/(?<![\w-:])text-white(?![\w-])/.test(line) && !line.includes("bg-destructive")) offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
