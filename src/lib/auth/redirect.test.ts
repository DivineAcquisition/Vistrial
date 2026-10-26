import { describe, expect, it } from "vitest";

import { isAuthPath, isProtectedAppPath, safeAppPath } from "@/lib/auth/redirect";

describe("safeAppPath", () => {
  it("keeps workspace and staff paths", () => {
    expect(safeAppPath("/app")).toBe("/app");
    expect(safeAppPath("/app/leads")).toBe("/app/leads");
    expect(safeAppPath("/admin")).toBe("/admin");
    expect(safeAppPath("/app/leads?stage=new")).toBe("/app/leads?stage=new");
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
