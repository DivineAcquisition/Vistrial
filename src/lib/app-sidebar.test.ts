import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("operator sidebar", () => {
  it("uses the coss sidebar instead of the aceternity demo", () => {
    const shell = readFileSync(path.join(process.cwd(), "src/components/app/app-shell.tsx"), "utf8");
    expect(shell).toContain('from "@/components/ui/sidebar"');
    expect(shell).toContain("SidebarProvider");
    expect(shell).toContain("SidebarInset");
    expect(shell).not.toContain("aceternity-sidebar");
    expect(shell).not.toMatch(/PanelLeftClose|PanelLeftOpen/);
  });

  it("renders a branded header, grouped nav, and a rail", () => {
    const sidebar = readFileSync(
      path.join(process.cwd(), "src/components/app/app-sidebar.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("collapsible=\"icon\"");
    expect(sidebar).toContain("SidebarRail");
    expect(sidebar).toContain("tone=\"on-light\"");
    expect(sidebar).toContain("OrgSwitcher");
    expect(sidebar).toContain("UserMenu");
  });

  it("marks the current destination on coss menu buttons", () => {
    const nav = readFileSync(
      path.join(process.cwd(), "src/components/app/app-nav-links.tsx"),
      "utf8",
    );
    expect(nav).toContain("SidebarMenuButton");
    expect(nav).toContain("isActive={active}");
    expect(nav).toContain("SidebarGroupLabel");
    expect(nav).toContain(">Now<");
    expect(nav).toContain(">More<");
    expect(nav).not.toContain("bg-brand-950");
  });
});
