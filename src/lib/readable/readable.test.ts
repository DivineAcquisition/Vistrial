import { describe, expect, it } from "vitest";

import fixture from "../../app/dev/pages-tab/fixture.json";
import { evidenceCounts, weakestEvidence } from "./evidence";
import { kindsMarked, markText } from "./highlight";
import { comparePages, coverage, coverageCounts, pageNeedles, pagePoints, pageVerdict, type FrameworkJob, type PageLike } from "./teardown";

const framework = fixture.view.framework as FrameworkJob[];
const own = fixture.pages[0] as unknown as PageLike;

describe("evidence labels", () => {
  it("a summary carries the weakest label of what it summarises", () => {
    expect(weakestEvidence(["Observed", "Inference", "Your data"])).toBe("Inference");
    expect(weakestEvidence(["Observed", "Untested hypothesis"])).toBe("Untested hypothesis");
    expect(weakestEvidence(["Your data", "Not enough data"])).toBe("Not enough data");
    expect(weakestEvidence(["Observed", "Your data"])).toBe("Observed");
    expect(weakestEvidence([])).toBeNull();
  });
  it("an unknown label is never read as stronger than an inference", () => {
    expect(weakestEvidence(["Observed", "Something new"])).toBe("Inference");
  });
  it("counts each label", () => {
    expect(evidenceCounts(["Observed", "Inference", "Observed"])).toEqual([
      { label: "Inference", count: 1 },
      { label: "Observed", count: 2 },
    ]);
  });
});

describe("highlights mark only text that is there", () => {
  it("marks a quote where it sits, whatever the spacing or case", () => {
    const segments = markText("A lead fills in your  form at 9pm and hears nothing until Monday. About $2,000 lost a month", [{ kind: "pain", text: "a lead fills in your form at 9pm and hears nothing until monday." }]);
    expect(segments).toEqual([
      { text: "A lead fills in your  form at 9pm and hears nothing until Monday.", kind: "pain" },
      { text: " About $2,000 lost a month", kind: null },
    ]);
  });
  it("marks nothing for a quote that is not in the text", () => {
    expect(markText("Book a call today", [{ kind: "proof", text: "41 booked calls in 30 days" }])).toEqual([{ text: "Book a call today", kind: null }]);
  });
  it("never loses or adds a character", () => {
    const text = "We take on 4 new clients a month. $3,500 setup, live in 14 days.";
    const segments = markText(text, [
      { kind: "price", text: "$3,500 setup, live in 14 days." },
      { kind: "pain", text: "4 new clients" },
      { kind: "fix", text: "new clients a month" },
    ]);
    expect(segments.map((row) => row.text).join("")).toBe(text);
    expect(kindsMarked([segments])).toEqual(["pain", "price"]);
  });
  it("ignores needles too short to mean anything", () => {
    expect(markText("Go on", [{ kind: "cta", text: "Go" }])).toEqual([{ text: "Go on", kind: null }]);
  });
});

describe("the coverage map", () => {
  const cells = coverage(framework, own.sections);
  it("has one cell per framework job, in framework order", () => {
    expect(cells.map((cell) => cell.key)).toEqual(framework.map((row) => row.key));
  });
  it("reads each status from the saved sections", () => {
    const status = Object.fromEntries(cells.map((cell) => [cell.key, cell.status]));
    expect(status).toMatchObject({ nav: "does", hero: "does", results: "leftOut", compare: "skipped", process: "partly", roles: "skipped", faq: "skipped", finalCta: "partly" });
  });
  it("agrees with the skipped jobs the server computed", () => {
    expect(cells.filter((cell) => cell.status === "skipped").map((cell) => cell.key)).toEqual(fixture.view.pages[0].skipped);
    expect(cells.filter((cell) => cell.position !== null).sort((a, b) => a.position! - b.position!).map((cell) => cell.key)).toEqual(fixture.view.pages[0].order);
  });
  it("counts, and never scores", () => {
    expect(coverageCounts(cells)).toEqual({ total: 11, present: 7, does: 5, partly: 2, doesNot: 0, skipped: 3, leftOut: 1, late: 0 });
  });
  it("flags a job the page puts later than the framework does", () => {
    const moved = coverage(framework, [
      { job: "hero", name: "Hero", does: "yes", note: "" },
      { job: "offer", name: "The offer", does: "yes", note: "" },
      { job: "problem", name: "Problem agitation", does: "no", note: "" },
    ]);
    expect(moved.filter((cell) => cell.late).map((cell) => cell.key)).toEqual(["problem"]);
    expect(moved.find((cell) => cell.key === "problem")?.status).toBe("doesNot");
  });
  it("shows the better of two sections for one job", () => {
    const twice = coverage(framework, [
      { job: "hero", name: "Hero", does: "no", note: "" },
      { job: "hero", name: "Hero", does: "partly", note: "" },
    ]);
    expect(twice.find((cell) => cell.key === "hero")).toMatchObject({ status: "partly", position: 1, sectionIndex: 0 });
  });
});

describe("the fallback verdict", () => {
  it("is a sentence of counts, labelled an inference", () => {
    expect(pageVerdict(coverage(framework, own.sections))).toEqual({
      text: "This page has a section for 7 of the framework's 11 jobs: 5 do their job and 2 partly. It skips With vs without, Your role vs ours and FAQ.",
      label: "Inference",
    });
  });
  it("says so when nothing was matched", () => {
    expect(pageVerdict(coverage(framework, [])).label).toBe("Not enough data");
  });
  it("makes no claim about results", () => {
    expect(pageVerdict(coverage(framework, own.sections)).text).not.toMatch(/convert|proven|will increase|best/i);
  });
});

describe("the points for a page", () => {
  const points = pagePoints(own, coverage(framework, own.sections));
  it("lists skipped jobs before partly-done sections, then counted facts", () => {
    expect(points.weakest.map((row) => row.text)).toEqual(["No With vs without section", "No Your role vs ours section", "No FAQ section", "Process timeline does part of its job", "Final CTA does part of its job", "Buttons lead to 2 places", "No proof on the page"]);
  });
  it("labels what code counted as observed and a reading as an inference", () => {
    expect(points.weakest.find((row) => row.text === "Buttons lead to 2 places")?.label).toBe("Observed");
    expect(points.weakest.find((row) => row.text === "No FAQ section")?.label).toBe("Inference");
  });
  it("lists what holds up", () => {
    expect(points.strongest.slice(0, 3).map((row) => row.text)).toEqual(["Pains and fixes pair one for one", "The headline states an outcome", "Nav does its job"]);
  });
});

describe("highlights for a page", () => {
  it("every saved pain is found in the page's own words", () => {
    const needles = pageNeedles(own);
    const lines = (own.sections as unknown as { blocks: { text: string }[] }[]).flatMap((section) => section.blocks.map((block) => markText(block.text, needles)));
    expect(kindsMarked(lines)).toEqual(["pain", "fix", "qualifier", "price"]);
  });
});

describe("the comparison across pages", () => {
  const result = comparePages(framework, fixture.view.pages);
  it("puts your page first", () => {
    expect(result.columns.map((page) => page.id)).toEqual(["p1", "p2", "p3"]);
  });
  it("matches the table code built on the server", () => {
    for (const row of result.rows) {
      const saved = fixture.view.table.find((entry) => entry.job === row.key);
      expect([row.key, row.others, row.of]).toEqual([row.key, saved?.pages.length, saved?.of]);
    }
  });
  it("names what your page lacks and others have", () => {
    expect(result.rows.filter((row) => row.lacking).map((row) => row.key)).toEqual(["results", "compare", "faq"]);
    expect(result.lacking).toBe(3);
  });
  it("lacks nothing when your page was not read", () => {
    expect(comparePages(framework, fixture.view.pages.filter((page) => !page.own)).lacking).toBe(0);
  });
});
