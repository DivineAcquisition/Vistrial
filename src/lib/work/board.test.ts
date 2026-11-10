import { describe, expect, it } from "vitest";

import { OFFER_SIZES, edgePath, fitBoard, offerBoard, roadmapBoard, type Board } from "./board";

function overlaps(board: Board) {
  const hits: string[] = [];
  board.nodes.forEach((a, i) =>
    board.nodes.slice(i + 1).forEach((b) => {
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) hits.push(`${a.id}/${b.id}`);
    }),
  );
  return hits;
}

describe("the Canvas view's layout", () => {
  it("lays an offer out as versions, the offer, competitors and the test plan, with nothing overlapping", () => {
    const board = offerBoard({ versions: [1, 2, 3], competitors: 3, changes: 3 });
    expect(board.nodes.map((node) => node.id)).toEqual(["version-1", "version-2", "version-3", "offer", "competitor-0", "competitor-1", "competitor-2", "change-0", "change-1", "change-2"]);
    expect(overlaps(board)).toEqual([]);
    const at = (id: string) => board.nodes.find((node) => node.id === id)!;
    // Versions sit left of the offer, competitors right of it, the test plan below everything.
    expect(at("version-3").x + at("version-3").w).toBeLessThan(at("offer").x);
    expect(at("competitor-0").x).toBeGreaterThan(at("offer").x + at("offer").w);
    expect(at("change-0").y).toBeGreaterThan(Math.max(at("offer").y + at("offer").h, at("competitor-2").y + at("competitor-2").h));
    // The newest version leads into the offer; every competitor and change is joined to the offer.
    expect(board.edges).toContainEqual({ from: "version-3", to: "offer", dir: "across", strong: true });
    expect(board.edges.filter((edge) => edge.from === "offer").map((edge) => edge.to)).toEqual(["competitor-0", "competitor-1", "competitor-2", "change-0", "change-1", "change-2"]);
    expect(board.width).toBe(Math.max(...board.nodes.map((node) => node.x + node.w)));
  });

  it("shows only the newest four versions, and an offer alone when there is nothing else yet", () => {
    expect(offerBoard({ versions: [1, 2, 3, 4, 5, 6], competitors: 0, changes: 0 }).nodes.map((node) => node.id)).toEqual(["version-3", "version-4", "version-5", "version-6", "offer"]);
    const alone = offerBoard({ versions: [], competitors: 0, changes: 0 });
    expect(alone.nodes).toEqual([{ id: "offer", x: 0, y: 0, ...OFFER_SIZES.offer }]);
    expect(alone.edges).toEqual([]);
  });

  it("lays the roadmap out as goal, stall, then each phase with its steps in a row", () => {
    const board = roadmapBoard({ goal: true, phases: [{ key: "fix", steps: [0, 1] }, { key: "build", steps: [2, 3] }, { key: "scale", steps: [4, 5] }] });
    expect(overlaps(board)).toEqual([]);
    expect(board.edges).toContainEqual({ from: "goal", to: "stall", dir: "down" });
    expect(board.edges.filter((edge) => edge.from === "stall").map((edge) => edge.to)).toEqual(["phase-fix", "phase-build", "phase-scale"]);
    expect(board.edges).toContainEqual({ from: "phase-build", to: "step-2", dir: "across" });
    expect(board.edges).toContainEqual({ from: "step-2", to: "step-3", dir: "across" });
    const at = (id: string) => board.nodes.find((node) => node.id === id)!;
    expect(at("step-1").y).toBe(at("step-0").y);
    expect(at("step-2").y).toBeGreaterThan(at("step-0").y + at("step-0").h);
    // No goal set: the board starts at the stall. A phase with no step still shows.
    const bare = roadmapBoard({ goal: false, phases: [{ key: "fix", steps: [] }] });
    expect(bare.nodes.map((node) => node.id)).toEqual(["stall", "data", "phase-fix"]);
    expect(bare.edges).toEqual([{ from: "stall", to: "phase-fix", dir: "across" }]);
  });

  it("joins cards with square-cornered lines and fits the board to a box without enlarging it", () => {
    const board = offerBoard({ versions: [1, 2], competitors: 2, changes: 1 });
    expect(edgePath(board, { from: "version-1", to: "version-2", dir: "down" })).toMatch(/^M\d+ \d+V\d+$/);
    expect(edgePath(board, { from: "offer", to: "competitor-0", dir: "across" })).toMatch(/^M\d+ \d+H\d+V\d+H\d+$/);
    expect(edgePath(board, { from: "offer", to: "nowhere", dir: "across" })).toBe("");
    const phone = fitBoard(board, { width: 358, height: 520 });
    expect(phone.k).toBeLessThan(1);
    expect(board.width * phone.k).toBeLessThanOrEqual(358 - 48 + 0.5);
    expect(fitBoard({ width: 300, height: 200 }, { width: 1200, height: 800 }).k).toBe(1);
    expect(fitBoard({ width: 0, height: 0 }, { width: 1200, height: 800 })).toEqual({ k: 1, x: 24, y: 24 });
  });
});
