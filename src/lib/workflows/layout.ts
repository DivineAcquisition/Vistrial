import { forwardEdges } from "@/lib/workflows/graph";
import type { WorkflowGraph } from "@/lib/workflows/types";

export type Placed = { id: string; x: number; y: number };

/**
 * A clean layered layout, deterministic, with no overlapping boxes. Each box
 * sits in a column set by its longest path from Start. "Tidy up" runs this.
 */
export function autoLayout(
  graph: WorkflowGraph,
  options: { direction: "LR" | "TB"; boxWidth?: number; boxHeight?: number; gap?: number } = { direction: "LR" }
): Placed[] {
  const width = options.boxWidth ?? 220;
  const height = options.boxHeight ?? 88;
  const gap = options.gap ?? 56;
  const edges = forwardEdges(graph);
  const layer = new Map<string, number>();
  const start = graph.boxes.find((box) => box.config.kind === "start");
  if (start) layer.set(start.id, 0);

  // Longest path relaxation. The forward edges form a DAG after the checker passes,
  // and the bound keeps a bad graph from looping here.
  for (let pass = 0; pass < graph.boxes.length; pass++) {
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

  const lanes = new Map<number, string[]>();
  const place = (id: string, depth: number) => lanes.set(depth, [...(lanes.get(depth) ?? []), id]);
  for (const box of graph.boxes) place(box.id, box.config.kind === "note" ? 0 : (layer.get(box.id) ?? 0));

  const out: Placed[] = [];
  for (const [depth, ids] of lanes) {
    ids.forEach((id, index) => {
      const along = depth * ((options.direction === "LR" ? width : height) + gap);
      const across = index * ((options.direction === "LR" ? height : width) + gap);
      out.push(options.direction === "LR" ? { id, x: along, y: across } : { id, x: across, y: along });
    });
  }
  return out;
}
