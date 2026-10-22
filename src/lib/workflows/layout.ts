import { forwardEdges } from "@/lib/workflows/graph";
import type { EdgeExit, WorkflowGraph } from "@/lib/workflows/types";

export type Placed = { id: string; x: number; y: number };

const EXIT_ORDER: EdgeExit[] = ["next", "no", "yes", "expired"];

/**
 * A clean layered layout, deterministic, with no overlapping boxes. Each box
 * sits in a column set by its longest path from Start. The longest branch stays
 * on the row it came from and shorter branches drop to rows below (a draft's
 * Expired line always drops), so a line
 * never has to pass behind a box on the main path. Notes sit on their own row
 * at the bottom. "Tidy up" runs this.
 */
export function autoLayout(
  graph: WorkflowGraph,
  options: { direction: "LR" | "TB"; boxWidth?: number; boxHeight?: number; gap?: number } = { direction: "LR" }
): Placed[] {
  const width = options.boxWidth ?? 220;
  const height = options.boxHeight ?? 88;
  const gap = options.gap ?? 56;
  const edges = forwardEdges(graph);
  const boxes = graph.boxes.filter((box) => box.config.kind !== "note");
  const notes = graph.boxes.filter((box) => box.config.kind === "note");
  const start = boxes.find((box) => box.config.kind === "start");

  const children = new Map<string, Array<{ to: string; exit: EdgeExit }>>();
  for (const edge of edges) children.set(edge.from, [...(children.get(edge.from) ?? []), { to: edge.to, exit: edge.exit }]);

  // Longest path relaxation. The forward edges form a DAG after the checker passes,
  // and the bound keeps a bad graph from looping here.
  const layer = new Map<string, number>();
  if (start) layer.set(start.id, 0);
  for (let pass = 0; pass < boxes.length; pass++) {
    let changed = false;
    for (const edge of edges) {
      const from = layer.get(edge.from);
      if (from === undefined) continue;
      if ((layer.get(edge.to) ?? -1) < from + 1) {
        layer.set(edge.to, from + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // How far each box is from the end of its longest path, to pick the main branch.
  const remaining = new Map<string, number>();
  const reach = (id: string, trail: Set<string>): number => {
    const known = remaining.get(id);
    if (known !== undefined) return known;
    if (trail.has(id)) return 0;
    trail.add(id);
    const best = Math.max(0, ...(children.get(id) ?? []).map((child) => 1 + reach(child.to, trail)));
    trail.delete(id);
    remaining.set(id, best);
    return best;
  };

  const lane = new Map<string, number>();
  let lanes = 0;
  const visit = (id: string, row: number) => {
    if (lane.has(id)) return;
    lane.set(id, row);
    lanes = Math.max(lanes, row + 1);
    // A Check keeps its longer branch on the row; every other box keeps Next or Approved there.
    const isCheck = graph.boxes.find((box) => box.id === id)?.config.kind === "check";
    const byOrder = (a: { exit: EdgeExit }, b: { exit: EdgeExit }) => EXIT_ORDER.indexOf(a.exit) - EXIT_ORDER.indexOf(b.exit);
    const ordered = [...(children.get(id) ?? [])].sort((a, b) =>
      isCheck ? reach(b.to, new Set()) - reach(a.to, new Set()) || byOrder(a, b) : byOrder(a, b)
    );
    ordered.forEach((child, index) => visit(child.to, index === 0 ? row : lanes));
  };
  if (start) visit(start.id, 0);
  for (const box of boxes) if (!lane.has(box.id)) visit(box.id, lanes);

  // Two boxes in the same column and row move apart, never on top of each other.
  const taken = new Set<string>();
  const spot = new Map<string, { depth: number; row: number }>();
  for (const box of boxes) {
    const depth = layer.get(box.id) ?? 0;
    let row = lane.get(box.id) ?? 0;
    while (taken.has(`${depth}:${row}`)) row += 1;
    taken.add(`${depth}:${row}`);
    spot.set(box.id, { depth, row });
  }
  const noteRow = Math.max(-1, ...[...spot.values()].map((item) => item.row)) + 1;
  notes.forEach((note, index) => spot.set(note.id, { depth: index, row: noteRow }));

  return graph.boxes.map((box) => {
    const { depth, row } = spot.get(box.id) ?? { depth: 0, row: 0 };
    const along = depth * ((options.direction === "LR" ? width : height) + gap);
    const across = row * ((options.direction === "LR" ? height : width) + gap);
    return options.direction === "LR" ? { id: box.id, x: along, y: across } : { id: box.id, x: across, y: along };
  });
}
