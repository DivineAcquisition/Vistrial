import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button-variants";
import { segmentedControlRootClassName } from "@/lib/segmented-control";
import {
  btnSizeSm,
  filterBar,
  insetChrome,
  insetSurface,
  pageStack,
  pageTitle,
} from "@/lib/ui";

describe("visual recipes stay aligned", () => {
  it("sizes default buttons to the same height as form fields", () => {
    const classes = buttonVariants({ size: "default" });
    expect(classes).toContain("h-10");
    expect(classes).toContain("sm:h-9");
  });

  it("fills outline buttons instead of leaving an empty ring", () => {
    const classes = buttonVariants({ variant: "outline" });
    expect(classes).toContain("bg-white/[0.04]");
    expect(classes).toContain("border-white/[0.08]");
  });

  it("keeps compact row actions at 32px on desktop", () => {
    expect(btnSizeSm).toContain("h-8!");
    expect(btnSizeSm).toContain("sm:h-8!");
    expect(btnSizeSm).not.toContain("sm:h-7");
  });

  it("gives nested panels a filled inset rather than a hairline outline", () => {
    expect(insetChrome).toContain("bg-white/[0.04]");
    expect(insetChrome).toContain("border-white/[0.06]");
    expect(insetSurface).toContain("p-4");
  });

  it("wraps filter bars in a padded surface", () => {
    expect(filterBar).toContain("rounded-2xl");
    expect(filterBar).toContain("p-4");
  });

  it("fills segmented controls instead of leaving a muted empty track", () => {
    expect(segmentedControlRootClassName).toContain("rounded-xl");
    expect(segmentedControlRootClassName).toContain("bg-white/[0.04]");
    expect(segmentedControlRootClassName).toContain("border-white/[0.06]");
  });

  it("keeps page titles large and pages stacked with room", () => {
    expect(pageTitle).toContain("font-heading");
    expect(pageTitle).toContain("text-[1.75rem]");
    expect(pageStack).toContain("gap-8");
  });
});
