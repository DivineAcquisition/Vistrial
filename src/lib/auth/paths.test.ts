import { describe, expect, it } from "vitest";

import { authCallbackUrl, safeInternalPath } from "@/lib/auth/paths";
import { postAuthPath } from "@/lib/auth/paths";
import { landingPath } from "@/lib/navigation";
import { canViewPortal, canWorkOperatorApp } from "@/lib/auth/permissions";

describe("portal-only landing", () => {
  it("sends a portal-only member to the owner portal", () => {
    expect(landingPath("portal")).toBe("/portal");
    expect(landingPath("operator", "setter")).toBe("/app/queue");
    expect(landingPath("operator", "owner")).toBe("/app/forsight");
    expect(postAuthPath("/app/queue", "portal")).toBe("/portal");
    expect(postAuthPath("/portal", "portal")).toBe("/portal");
    expect(postAuthPath("/app/queue", "operator")).toBe("/app/queue");
  });

  it("does not give a setter portal access or a portal-only owner an operator seat", () => {
    expect(canViewPortal("setter")).toBe(false);
    expect(canViewPortal("owner")).toBe(true);
    expect(canWorkOperatorApp("owner", "portal")).toBe(false);
    expect(canWorkOperatorApp("owner", "operator")).toBe(true);
  });
});

describe("safeInternalPath", () => {
  it("keeps the path the user originally asked for, query and hash included", () => {
    expect(safeInternalPath("/app/case-files/abc")).toBe("/app/case-files/abc");
    expect(safeInternalPath("/app/queue?filter=never-touched")).toBe(
      "/app/queue?filter=never-touched"
    );
    expect(safeInternalPath("/app/queue#top")).toBe("/app/queue#top");
  });

  it("falls back when there is nothing usable", () => {
    expect(safeInternalPath(null)).toBe("/app/queue");
    expect(safeInternalPath("")).toBe("/app/queue");
    expect(safeInternalPath(undefined, "/portal")).toBe("/portal");
  });

  it("rejects anything that is not a relative path", () => {
    expect(safeInternalPath("app/queue")).toBe("/app/queue");
    expect(safeInternalPath("https://evil.example/app")).toBe("/app/queue");
    expect(safeInternalPath("//evil.example")).toBe("/app/queue");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/app/queue");
  });

  // These all look relative but resolve off-origin once parsed as a URL, which
  // is what the browser does before following the post-login redirect.
  it.each([
    ["backslash read as a slash", "/\\evil.example"],
    ["doubled backslash", "/\\\\evil.example"],
    ["tab stripped during parsing", "/\t/evil.example"],
    ["newline stripped during parsing", "/\n/evil.example"],
    ["carriage return stripped during parsing", "/\r/evil.example"],
    ["backslash after a real segment", "/app/\\evil.example"],
  ])("refuses a redirect that escapes the origin via %s", (_label, value) => {
    const result = safeInternalPath(value);
    expect(new URL(result, "https://app.vistrial.com").host).toBe("app.vistrial.com");
  });

  it("never returns a value that leaves our origin", () => {
    const probes = [
      "/app/queue",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\u0000/evil.example",
      "https://evil.example",
      "/app/../../evil",
    ];
    for (const probe of probes) {
      const host = new URL(safeInternalPath(probe), "https://app.vistrial.com").host;
      expect(host).toBe("app.vistrial.com");
    }
  });

  it("keeps a smuggled redirect out of the emailed magic-link callback", () => {
    const callback = new URL(authCallbackUrl(safeInternalPath("/\\evil.example")));
    expect(callback.searchParams.get("next")).not.toContain("evil.example");
  });
});
