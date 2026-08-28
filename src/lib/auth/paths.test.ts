import { describe, expect, it } from "vitest";

import { postAuthPath } from "@/lib/auth/paths";
import { landingPath } from "@/lib/navigation";
import { canViewPortal, canWorkOperatorApp } from "@/lib/auth/permissions";

describe("portal-only landing", () => {
  it("sends a portal-only member to the owner portal", () => {
    expect(landingPath("portal")).toBe("/portal");
    expect(landingPath("operator")).toBe("/app/queue");
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
