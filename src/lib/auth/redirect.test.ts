import { describe, expect, it } from "vitest";

import { authHref, isAuthPath, isProtectedAppPath, safeAppPath, ssoCallbackPath } from "@/lib/auth/redirect";

describe("safeAppPath", () => {
  it("keeps workspace and staff paths", () => {
    expect(safeAppPath("/app")).toBe("/app");
    expect(safeAppPath("/app/leads")).toBe("/app/leads");
    expect(safeAppPath("/admin")).toBe("/admin");
    expect(safeAppPath("/app/leads?stage=new")).toBe("/app/leads?stage=new");
    expect(safeAppPath("/join?token=abc")).toBe("/join?token=abc");
    expect(safeAppPath("/joinery")).toBe("/app");
  });

  it("rejects anything outside the app", () => {
    expect(safeAppPath("https://evil.example")).toBe("/app");
    expect(safeAppPath("//evil.example")).toBe("/app");
    expect(safeAppPath("/sign-in")).toBe("/app");
    expect(safeAppPath(null)).toBe("/app");
  });
});

describe("auth paths", () => {
  it("separates the sign-in page from the workspace", () => {
    expect(isAuthPath("/sign-in")).toBe(true);
    expect(isAuthPath("/sign-in/factor-one")).toBe(true);
    expect(isAuthPath("/sign-up")).toBe(true);
    expect(isAuthPath("/app")).toBe(false);
    expect(isProtectedAppPath("/app/leads")).toBe(true);
    expect(isProtectedAppPath("/admin")).toBe(true);
    expect(isProtectedAppPath("/sign-in")).toBe(false);
  });
});

describe("links between the auth pages", () => {
  it("carry where the person was headed, including an invite", () => {
    expect(authHref("/sign-up", "/app/research?tab=2")).toBe("/sign-up?redirect_url=%2Fapp%2Fresearch%3Ftab%3D2");
    expect(authHref("/sign-in", "/join?token=abc")).toBe("/sign-in?redirect_url=%2Fjoin%3Ftoken%3Dabc");
    expect(ssoCallbackPath("/join?token=abc", "sign-up")).toBe("/sign-in/sso-callback?from=sign-up&redirect_url=%2Fjoin%3Ftoken%3Dabc");
    expect(isAuthPath("/sign-in/sso-callback")).toBe(true);
  });

  it("never carry an outside address", () => {
    for (const bad of ["https://evil.example/app", "//evil.example", "/\\evil.example", "/pricing", "javascript:alert(1)"]) {
      expect(authHref("/sign-in", bad)).toBe("/sign-in?redirect_url=%2Fapp");
      expect(ssoCallbackPath(bad, "sign-in")).toBe("/sign-in/sso-callback?from=sign-in&redirect_url=%2Fapp");
    }
  });
});
