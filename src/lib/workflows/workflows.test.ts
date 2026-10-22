import { describe, expect, it } from "vitest";

import { checkWorkflow } from "@/lib/workflows/checker";
import { insertAfter, moveWithinBranch, removeBox, updateBox } from "@/lib/workflows/edit";
import { autoLayout } from "@/lib/workflows/layout";
import { toOutline } from "@/lib/workflows/outline";
import { reachableFrom } from "@/lib/workflows/graph";
import type { Box, CheckContext, Edge, WorkflowGraph } from "@/lib/workflows/types";

const ctx: CheckContext = {
  stages: new Set(["Quoted"]),
  snippetIds: new Set(["snip1"]),
  talkTrackIds: new Set(["tt1"]),
  memberIds: new Set(["m1"]),
  roles: new Set(["owner"]),
  channels: new Set(["text", "email"] as const),
  routingAvailable: true,
};

const box = (id: string, config: Box["config"]): Box => ({ id, config });
const edge = (from: string, to: string, exit: Edge["exit"] = "next", maxPasses?: number): Edge => ({
  id: `${from}-${to}-${exit}`,
  from,
  to,
  exit,
  maxPasses,
});
const draft = (id: string): Box =>
  box(id, { kind: "draft", channel: "text", contentKind: "talk_track", contentRef: "tt1", windowHours: 24 });
const wait = (id: string, days = 2): Box => box(id, { kind: "wait", amount: days, unit: "days" });
const end = (id: string, reason: "won" | "stopped" = "stopped"): Box => box(id, { kind: "end", reason });

/** Start, wait, draft, wait for reply check, then ends. */
function valid(): WorkflowGraph {
  return {
    boxes: [
      box("s", { kind: "start", trigger: "new_lead" }),
      wait("w1"),
      draft("d1"),
      wait("w2", 3),
      box("c1", { kind: "check", check: "replied_since", yesLabel: "Replied", noLabel: "No reply" }),
      end("e1", "won"),
      end("e2"),
      end("e3"),
    ],
    edges: [
      edge("s", "w1"),
      edge("w1", "d1"),
      edge("d1", "w2"),
      edge("d1", "e3", "expired"),
      edge("w2", "c1"),
      edge("c1", "e1", "yes"),
      edge("c1", "e2", "no"),
    ],
  };
}

const codes = (graph: WorkflowGraph, context = ctx) => checkWorkflow(graph, context).issues.filter((i) => i.severity === "error").map((i) => i.code);

describe("checker", () => {
  it("passes a well formed workflow and shows the quiet hours rule as a note", () => {
    const result = checkWorkflow(valid(), ctx);
    expect(result.ok).toBe(true);
    expect(result.issues.some((i) => i.code === "quiet_hours")).toBe(true);
  });

  it("blocks a missing or doubled Start", () => {
    const none = valid();
    none.boxes = none.boxes.filter((b) => b.id !== "s");
    none.edges = none.edges.filter((e) => e.from !== "s");
    expect(codes(none)).toContain("one_start");
    const two = valid();
    two.boxes.push(box("s2", { kind: "start", trigger: "manual" }));
    expect(codes(two)).toContain("one_start");
  });

  it("blocks a path with no End", () => {
    const g = valid();
    g.edges = g.edges.filter((e) => !(e.from === "c1" && e.exit === "no"));
    g.edges.push(edge("c1", "w1", "no"));
    expect(codes(g)).toContain("endless_loop");
  });

  it("blocks a dead path and a missing check exit", () => {
    const g = valid();
    g.edges = g.edges.filter((e) => !(e.from === "c1" && e.exit === "no"));
    expect(codes(g)).toContain("missing_exit");
    const dead: WorkflowGraph = {
      boxes: [box("s", { kind: "start", trigger: "new_lead" }), wait("w1"), end("e1")],
      edges: [edge("s", "w1")],
    };
    expect(codes(dead)).toContain("missing_exit");
  });

  it("allows a counted loop and blocks an unbounded or too long one", () => {
    const counted = valid();
    counted.edges = counted.edges.filter((e) => !(e.from === "c1" && e.exit === "no"));
    counted.edges.push(edge("c1", "w1", "no", 3));
    counted.boxes = counted.boxes.filter((b) => b.id !== "e2");
    expect(codes(counted)).toEqual([]);

    const unbounded = { ...counted, edges: counted.edges.map((e) => (e.maxPasses !== undefined ? { ...e, maxPasses: 0 } : e)) };
    expect(codes(unbounded)).toContain("loop_unbounded");
    const open = { ...counted, edges: counted.edges.map((e) => ({ ...e, maxPasses: undefined })) };
    expect(codes(open)).toContain("endless_loop");
    const long = { ...counted, edges: counted.edges.map((e) => (e.maxPasses !== undefined ? { ...e, maxPasses: 6 } : e)) };
    expect(codes(long)).toContain("loop_too_long");
  });

  it("blocks back to back drafts and too frequent drafts", () => {
    const g = valid();
    g.boxes = g.boxes.filter((b) => b.id !== "w2");
    g.boxes.push(draft("d2"));
    g.edges = g.edges.filter((e) => e.from !== "d1" && e.to !== "c1" && e.from !== "w2");
    g.edges.push(edge("d1", "d2"), edge("d1", "e3", "expired"), edge("d2", "c1"), edge("d2", "e3", "expired"));
    expect(codes(g)).toContain("back_to_back");

    const short = valid();
    short.boxes = short.boxes.map((b) => (b.id === "w2" ? box("w2", { kind: "wait", amount: 2, unit: "hours" }) : b));
    short.boxes.push(draft("d2"));
    short.edges = short.edges.filter((e) => e.from !== "c1");
    short.edges.push(edge("c1", "d2", "no"), edge("c1", "e1", "yes"), edge("d2", "e2"), edge("d2", "e3", "expired"));
    expect(codes(short)).toContain("too_frequent");
  });

  it("blocks drafts that point at deleted content, a missing channel, or an unavailable channel", () => {
    const g = valid();
    expect(codes(g, { ...ctx, talkTrackIds: new Set() })).toContain("content_deleted");
    expect(codes(g, { ...ctx, channels: new Set(["email"] as const) })).toContain("channel_unavailable");
    const nochannel = updateBox(g, "d1", { kind: "draft", channel: null, contentKind: "talk_track", contentRef: "tt1", windowHours: 24 });
    expect(codes(nochannel)).toContain("missing_channel");
  });

  it("blocks references to people and stages that no longer exist, and missing routing", () => {
    const g = valid();
    g.boxes.push(box("t", { kind: "task", text: "Call", dueHours: 4, assignee: { kind: "person", memberId: "gone" }, alert: false }));
    g.edges = g.edges.filter((e) => e.from !== "c1" || e.exit !== "no");
    g.edges.push(edge("c1", "t", "no"), edge("t", "e2"));
    expect(codes(g)).toContain("assignee_gone");
    const stage = updateBox(valid(), "s", { kind: "start", trigger: "stage_changed", stage: "Gone" });
    expect(codes(stage)).toContain("missing_stage");
    const route = valid();
    route.boxes.push(box("r", { kind: "route", mode: "assign_unowned" }));
    route.edges = route.edges.filter((e) => e.from !== "w1");
    route.edges.push(edge("w1", "r"), edge("r", "d1"));
    expect(codes(route, { ...ctx, routingAvailable: false })).toContain("no_routing");
  });

  it("enforces the box limit", () => {
    const g = valid();
    for (let i = 0; i < 40; i++) g.boxes.push(box(`n${i}`, { kind: "note", text: "x" }));
    expect(codes(g)).toContain("too_many_boxes");
  });

  it("rejects dangling lines and notes that carry behavior", () => {
    const g = valid();
    g.edges.push(edge("w1", "nowhere"));
    expect(codes(g)).toContain("dangling_edge");
    const n = valid();
    n.boxes.push(box("n", { kind: "note", text: "hi" }));
    n.edges.push(edge("w1", "n"));
    expect(codes(n)).toContain("note_connected");
  });

  it("warns, without blocking, on unhealthy connections", () => {
    const result = checkWorkflow(valid(), { ...ctx, unhealthyChannels: new Set(["text"] as const) });
    expect(result.ok).toBe(true);
    expect(result.issues.some((i) => i.code === "connection_unhealthy")).toBe(true);
  });

  it("never lets any randomly damaged graph pass while it has a structural fault", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 300; i++) {
      const g = valid();
      const cut = g.edges.filter(() => rnd() > 0.2);
      const damaged = { boxes: g.boxes, edges: cut };
      const result = checkWorkflow(damaged, ctx);
      if (result.ok) {
        // A passing graph must really have every required exit and reach an End.
        const reach = reachableFrom(damaged, "s");
        expect([...reach].some((id) => damaged.boxes.find((b) => b.id === id)?.config.kind === "end")).toBe(true);
        for (const b of damaged.boxes.filter((x) => reach.has(x.id) && x.config.kind !== "end")) {
          expect(damaged.edges.some((e) => e.from === b.id)).toBe(true);
        }
      }
    }
  });
});

describe("one system: outline and graph", () => {
  const ids = (g: WorkflowGraph) => g.boxes.map((b) => b.id).sort();

  it("lists every box exactly once as a row, nesting branches", () => {
    const g = valid();
    const rows = toOutline(g);
    const shown = rows.filter((r) => !r.goesTo).map((r) => r.boxId).sort();
    expect(shown).toEqual(ids(g));
    expect(rows.find((r) => r.boxId === "e1")?.branch).toBe("Replied");
    expect(rows.find((r) => r.boxId === "e2")?.branch).toBe("No reply");
  });

  it("stays in agreement after random edits", () => {
    let seed = 3;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    let g = valid();
    for (let i = 0; i < 200; i++) {
      const movable = g.boxes.filter((b) => ["wait", "task", "route"].includes(b.config.kind));
      const roll = rnd(3);
      if (roll === 0) {
        const parents = g.boxes.filter((b) => ["start", "wait"].includes(b.config.kind));
        const parent = parents[rnd(parents.length)];
        g = insertAfter(g, parent.id, "next", wait(`x${i}`, 1 + rnd(3)));
      } else if (roll === 1 && movable.length > 0) {
        g = removeBox(g, movable[rnd(movable.length)].id);
      } else if (movable.length > 0) {
        g = moveWithinBranch(g, movable[rnd(movable.length)].id, rnd(2) ? "up" : "down");
      }
      const shown = toOutline(g).filter((r) => !r.goesTo).map((r) => r.boxId).sort();
      expect(shown).toEqual(ids(g));
      expect(new Set(g.edges.map((e) => e.from)).size).toBeGreaterThan(0);
      expect(checkWorkflow(g, ctx).issues.filter((x) => x.code === "dangling_edge")).toEqual([]);
    }
  });

  it("moves a wait up and down without breaking the chain", () => {
    const g = valid();
    const moved = moveWithinBranch(insertAfter(g, "w1", "next", wait("wx", 1)), "wx", "down");
    expect(checkWorkflow(moved, ctx).ok).toBe(true);
  });

  it("removing a middle box reconnects its neighbours", () => {
    const g = removeBox(valid(), "w2");
    expect(g.edges.some((e) => e.from === "d1" && e.to === "c1" && e.exit === "next")).toBe(true);
  });
});

describe("layout", () => {
  it("never places two boxes on the same spot and puts later steps further along", () => {
    const placed = autoLayout(valid(), { direction: "LR" });
    const spots = new Set(placed.map((p) => `${p.x},${p.y}`));
    expect(spots.size).toBe(placed.length);
    const x = (id: string) => placed.find((p) => p.id === id)?.x ?? -1;
    expect(x("d1")).toBeGreaterThan(x("w1"));
    const top = autoLayout(valid(), { direction: "TB" });
    expect(top.find((p) => p.id === "d1")!.y).toBeGreaterThan(top.find((p) => p.id === "w1")!.y);
  });
});

describe("checker with unknown channels", () => {
  it("warns instead of guessing when channel availability is not supplied", () => {
    const result = checkWorkflow(valid(), { ...ctx, channels: undefined });
    expect(result.ok).toBe(true);
    expect(result.issues.some((i) => i.code === "channel_unchecked")).toBe(true);
  });
});
