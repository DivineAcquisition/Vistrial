import { describe, expect, it } from "vitest";

import { bodyText, cardTitle, insetWell, pageLede, pageTitle, pageStack } from "@/lib/ui";

describe("in-app type and surface recipes", () => {
  it("uses a SaaS heading weight on page titles", () => {
    expect(pageTitle).toContain("font-heading");
    expect(pageTitle).toContain("font-semibold");
    expect(cardTitle).toContain("font-semibold");
  });

  it("keeps descriptions a step above caption size", () => {
    expect(pageLede).toContain("text-[15px]");
    expect(bodyText).toContain("text-[15px]");
  });

  it("shares one stack and inset well across screens", () => {
    expect(pageStack).toContain("gap-6");
    expect(insetWell).toContain("rounded-xl");
    expect(insetWell).toContain("p-4");
  });
});
