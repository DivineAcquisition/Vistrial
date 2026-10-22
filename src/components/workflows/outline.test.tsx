import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowOutline } from "@/components/workflows/outline";
import { proposalWorkflows } from "@/lib/workflows/templates";

describe("workflow outline", () => {
  it("reads every step without a wide fixed layout", () => {
    const html = renderToString(<WorkflowOutline graph={proposalWorkflows()[0].document.graph} />);
    expect(html).toContain("New lead");
    expect(html).toContain("Did they reply?");
    expect(html).toContain("Needs approval");
    expect(html).toContain("min-w-0");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("w-screen");
    expect(html).not.toContain("—");
  });
});