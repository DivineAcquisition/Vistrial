import { describe, expect, it } from "vitest";

import { checkWorkflow } from "@/lib/workflows/checker";
import { addBox, connectExit, defaultConfig, exitsOf, removeBox, setLoopPasses, ADDABLE_KINDS } from "@/lib/workflows/edit";
import { toFlow, tidyPositions } from "@/lib/workflows/flow";
import { createHistory, pushHistory, redoHistory, undoHistory } from "@/lib/workflows/history";
import { toOutline } from "@/lib/workflows/outline";
import { NEW_LEAD_RESPONSE, QUOTE_GONE_QUIET, SAMPLE_WORKFLOWS, sampleCheckContext } from "@/lib/workflows/samples";
import { parseWorkflowGraph } from "@/lib/workflows/schema";

describe("editing a workflow", () => {
  it("adds a box on an exit and keeps the path joined", () => {
    const { graph, id } = addBox(NEW_LEAD_RESPONSE.graph, "wait", { fromId: "c1", exit: "no" });
    const into = graph.edges.find((edge) => edge.to === id);
    const out = graph.edges.find((edge) => edge.from === id);
    expect(into).toMatchObject({ from: "c1", exit: "no" });
    expect(out).toMatchObject({ to: "d2", exit: "next" });
  });

  it("starts every new box with plain, safe settings that never send by themselves", () => {
    for (const kind of ADDABLE_KINDS) {
      const config = defaultConfig(kind);
      expect(config.kind).toBe(kind);
      if (config.kind === "draft") expect(config.contentRef).toBeNull();
    }
  });

  it("turns a line back to an earlier box into a counted loop, never an endless one", () => {
    const graph = connectExit(NEW_LEAD_RESPONSE.graph, "c2", "no", "w2");
    const edge = graph.edges.find((item) => item.from === "c2" && item.exit === "no");
    expect(edge?.maxPasses).toBe(1);
    expect(checkWorkflow(graph, sampleCheckContext()).issues.map((issue) => issue.code)).not.toContain("endless_loop");
    const raised = setLoopPasses(graph, edge!.id, 3);
    expect(raised.edges.find((item) => item.id === edge!.id)?.maxPasses).toBe(3);
  });

  it("replaces what an exit led to instead of adding a second line", () => {
    const graph = connectExit(NEW_LEAD_RESPONSE.graph, "c1", "yes", "e2");
    expect(graph.edges.filter((edge) => edge.from === "c1" && edge.exit === "yes")).toHaveLength(1);
  });

  it("names every exit in plain words", () => {
    expect(exitsOf(NEW_LEAD_RESPONSE.graph.boxes.find((box) => box.id === "c1")!.config)).toEqual([
      { exit: "yes", label: "Replied" },
      { exit: "no", label: "No reply" },
    ]);
    expect(exitsOf(defaultConfig("draft")).map((item) => item.label)).toEqual(["Approved", "Expired"]);
    expect(exitsOf(defaultConfig("end"))).toEqual([]);
  });
});

describe("undo and redo", () => {
  it("steps back and forward through whole graphs", () => {
    let history = createHistory(NEW_LEAD_RESPONSE.graph);
    const one = removeBox(history.present, "t2");
    history = pushHistory(history, one);
    const two = addBox(history.present, "note").graph;
    history = pushHistory(history, two);
    history = undoHistory(history);
    expect(history.present).toBe(one);
    history = undoHistory(history);
    expect(history.present).toBe(NEW_LEAD_RESPONSE.graph);
    history = redoHistory(redoHistory(history));
    expect(history.present).toBe(two);
    expect(undoHistory(createHistory(one))).toEqual(createHistory(one));
  });
});

describe("the canvas and the outline read one graph", () => {
  it("draws one node per box and one line per edge, with branch labels and loop limits", () => {
    const issues = checkWorkflow(QUOTE_GONE_QUIET.graph, sampleCheckContext()).issues;
    const flow = toFlow(QUOTE_GONE_QUIET.graph, { direction: "LR", issues, editable: true });
    expect(flow.nodes.map((node) => node.id).sort()).toEqual(QUOTE_GONE_QUIET.graph.boxes.map((box) => box.id).sort());
    expect(flow.edges).toHaveLength(QUOTE_GONE_QUIET.graph.edges.length);
    expect(flow.edges.find((edge) => edge.id === "e-c1-e1")?.data?.label).toBe("Replied");
    expect(flow.edges.find((edge) => edge.id === "e-d1-e2")?.data).toMatchObject({ label: "Expired", tone: "warning" });
    expect(flow.edges.find((edge) => edge.id === "e-d2-w2")?.data).toMatchObject({ loop: true, detail: "Up to 2 times" });
    const outlineIds = new Set(toOutline(QUOTE_GONE_QUIET.graph).map((row) => row.boxId));
    for (const node of flow.nodes) expect(outlineIds.has(node.id)).toBe(true);
  });

  it("puts checker messages on the box they belong to", () => {
    const { graph } = addBox(NEW_LEAD_RESPONSE.graph, "draft", { fromId: "c2", exit: "no" });
    const issues = checkWorkflow(graph, sampleCheckContext()).issues;
    const flow = toFlow(graph, { direction: "TB", issues, editable: false });
    const added = flow.nodes.find((node) => !NEW_LEAD_RESPONSE.graph.boxes.some((box) => box.id === node.id));
    expect(added?.data.errors).toContain("Choose a snippet or talk track for this message.");
    expect(added?.draggable).toBe(false);
  });

  it("lays out without overlap, left to right and top to bottom", () => {
    for (const sample of SAMPLE_WORKFLOWS) {
      for (const direction of ["LR", "TB"] as const) {
        const spots = Object.values(tidyPositions(sample.graph, direction)).map((p) => `${p.x}:${p.y}`);
        expect(new Set(spots).size).toBe(spots.length);
      }
    }
  });
});

describe("what may be saved", () => {
  it("accepts every sample and refuses boxes or settings outside the list", () => {
    for (const sample of SAMPLE_WORKFLOWS) expect(parseWorkflowGraph(sample.graph).ok).toBe(true);
    expect(parseWorkflowGraph({ boxes: [{ id: "x", config: { kind: "webhook", url: "https://example.com" } }], edges: [] }).ok).toBe(false);
    expect(parseWorkflowGraph({ boxes: [{ id: "s", config: { kind: "start", trigger: "run_code" } }], edges: [] }).ok).toBe(false);
    expect(
      parseWorkflowGraph({ boxes: [], edges: [{ id: "e", from: "a", to: "b", exit: "next", maxPasses: 99 }] }).ok
    ).toBe(false);
    expect(parseWorkflowGraph({ boxes: Array.from({ length: 41 }, (_, i) => ({ id: `n${i}`, config: { kind: "note", text: "x" } })), edges: [] }).ok).toBe(false);
  });
});
