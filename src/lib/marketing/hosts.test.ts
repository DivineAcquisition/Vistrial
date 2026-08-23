import { describe, expect, it } from "vitest";

import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";
import { isOperatorAppHost } from "@/lib/marketing/hosts";

describe("isOperatorAppHost", () => {
  it("treats only the operator app host as the app", () => {
    expect(isOperatorAppHost(new URL(PRODUCTION_APP_ORIGIN).host)).toBe(true);
    expect(isOperatorAppHost("app.vistrial.io")).toBe(true);
    expect(isOperatorAppHost("vistrial.io")).toBe(false);
    expect(isOperatorAppHost("www.vistrial.io")).toBe(false);
    expect(isOperatorAppHost("localhost:3000")).toBe(false);
  });
});
