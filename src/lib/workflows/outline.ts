import { describeBox } from "@/lib/workflows/describe";
import { boxById, outgoing } from "@/lib/workflows/graph";
import type { BoxConfig, EdgeExit, WorkflowGraph } from "@/lib/workflows/types";

export type OutlineItem = {
  boxId: string;
  depth: number;
  kind: BoxConfig["kind"];
  title: string;
  summary: string;
  /** The label of the line that led here, for example "Replied". Null on the main path. */
  branch: string | null;
  /** True when this box is shown elsewhere. The row only says where it goes. */
  goesTo: boolean;
  /** Present on a counted loop that returns to an earlier box. */
  loopPasses: number | null;
};

const ORDER: EdgeExit[] = ["next", "yes", "no", "expired"];

function branchLabel(graph: WorkflowGraph, fromId: string, exit: EdgeExit): string | null {
  const from = boxById(graph, fromId);
  if (!from || exit === "next") return null;
  if (exit === "yes" && from.config.kind === "check") return from.config.yesLabel;
  if (exit === "no" && from.config.kind === "check") return from.config.noLabel;
  if (exit === "expired") return "Expired";
  return null;
}

/**
 * The list view of a workflow. It reads the same graph the canvas draws, so
 * the two always agree. Notes are listed last, under their own heading by kind.
 */
export function toOutline(graph: WorkflowGraph): OutlineItem[] {
  const start = graph.boxes.find((box) => box.config.kind === "start");
  const items: OutlineItem[] = [];
  if (!start) return items;
  const shown = new Set<string>();

  const walk = (id: string, depth: number, branch: string | null, loopPasses: number | null) => {
    const box = boxById(graph, id);
    if (!box) return;
    const { title, summary } = describeBox(box);
    if (shown.has(id)) {
      items.push({ boxId: id, depth, kind: box.config.kind, title, summary, branch, goesTo: true, loopPasses });
      return;
    }
    shown.add(id);
    items.push({ boxId: id, depth, kind: box.config.kind, title, summary, branch, goesTo: false, loopPasses });
    const out = [...outgoing(graph, id)].sort((a, b) => ORDER.indexOf(a.exit) - ORDER.indexOf(b.exit));
    const branching = out.length > 1;
    for (const edge of out) {
      const label = branchLabel(graph, id, edge.exit);
      walk(edge.to, branching ? depth + 1 : depth, label, edge.maxPasses ?? null);
    }
  };
  walk(start.id, 0, null, null);

  for (const box of graph.boxes.filter((item) => item.config.kind === "note")) {
    const { title, summary } = describeBox(box);
    items.push({ boxId: box.id, depth: 0, kind: "note", title, summary, branch: null, goesTo: false, loopPasses: null });
  }
  return items;
}

/** Plain words for screen readers and the phone outline: one sentence per row. */
export function outlineSentence(item: OutlineItem): string {
  const lead = item.branch ? `If ${item.branch}: ` : "";
  if (item.goesTo) return `${lead}Go back to ${item.title}.${item.loopPasses ? ` Up to ${item.loopPasses} times.` : ""}`;
  return `${lead}${item.title}. ${item.summary}`;
}
