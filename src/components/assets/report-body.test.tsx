import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportBody, reportMarkdown } from "@/components/assets/report-body";

describe("report body", () => {
  it("renders headings, lists and emphasis from the report's Markdown", () => {
    const html = renderToStaticMarkup(<ReportBody body={"# Market report\n\n**Objective:** Find offers.\n\n## Opportunities\n\n- One _idea_\n- Two"} />);
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<strong");
    expect(html).toContain("<em>idea</em>");
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it("never turns text into markup, whatever a source or model wrote", () => {
    const html = renderToStaticMarkup(<ReportBody body={'# Title\n\n<script>alert(1)</script> and <img src=x onerror="alert(1)">'} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("exports the body, each claim's basis, and every cited source once", () => {
    const text = reportMarkdown("Austin [deep] clean", 2, "# Market report\n\nBody.", [
      { claimKey: "f1", statement: "Trust leads.", basisLabel: "Observed", sources: [{ title: "Molly [Maid]", url: "https://a.example.com", publisher: "Molly Maid" }] },
      { claimKey: "f2", statement: "Price may help.", basisLabel: "Inference", sources: [{ title: "Molly [Maid]", url: "https://a.example.com", publisher: "Molly Maid" }] },
    ]);
    expect(text).toContain("version 2");
    expect(text).toContain("- **Observed:** Trust leads.");
    expect(text).toContain("- [Molly Maid](https://a.example.com), Molly Maid");
    expect(text.match(/https:\/\/a\.example\.com/g)).toHaveLength(1);
  });
});
