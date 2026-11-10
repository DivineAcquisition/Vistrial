/**
 * The Canvas view's layout, worked out in code: where each card sits on the board and which cards are
 * joined. The layout is automatic and read-only (nothing a person arranges is stored), so the same data
 * always draws the same board. Pure, so a test can read every position.
 */

export type BoardNode = { id: string; x: number; y: number; w: number; h: number };
/** `across` joins a card to the one on its right; `down` joins it to the one below. */
export type BoardEdge = { from: string; to: string; dir: "across" | "down"; strong?: boolean };
export type Board = { nodes: BoardNode[]; edges: BoardEdge[]; width: number; height: number };

const GAP = 28;
const LANE = 90;

function finish(nodes: BoardNode[], edges: BoardEdge[]): Board {
  return { nodes, edges, width: Math.max(0, ...nodes.map((node) => node.x + node.w)), height: Math.max(0, ...nodes.map((node) => node.y + node.h)) };
}

export const OFFER_SIZES = { version: { w: 210, h: 76 }, offer: { w: 380, h: 320 }, competitor: { w: 300, h: 124 }, change: { w: 250, h: 168 } } as const;

/**
 * An offer's board: its versions down the left, leading into the offer; competitors from approved research
 * to its right; the test plan in a row underneath. Ids: `version-<n>`, `offer`, `competitor-<i>`, `change-<i>`.
 */
export function offerBoard(input: { versions: number[]; competitors: number; changes: number }): Board {
  const S = OFFER_SIZES;
  const nodes: BoardNode[] = [];
  const edges: BoardEdge[] = [];
  const versions = input.versions.slice(-4);
  const versionsHeight = versions.length ? versions.length * S.version.h + (versions.length - 1) * GAP : 0;
  const competitorsHeight = input.competitors ? input.competitors * S.competitor.h + (input.competitors - 1) * GAP : 0;
  const top = Math.max(versionsHeight, competitorsHeight, S.offer.h);
  const offerX = versions.length ? S.version.w + LANE : 0;
  const offerY = Math.round((top - S.offer.h) / 2);
  versions.forEach((version, index) => {
    nodes.push({ id: `version-${version}`, x: 0, y: Math.round((top - versionsHeight) / 2) + index * (S.version.h + GAP), ...S.version });
    if (index > 0) edges.push({ from: `version-${versions[index - 1]}`, to: `version-${version}`, dir: "down" });
  });
  nodes.push({ id: "offer", x: offerX, y: offerY, ...S.offer });
  if (versions.length) edges.push({ from: `version-${versions[versions.length - 1]}`, to: "offer", dir: "across", strong: true });
  for (let index = 0; index < input.competitors; index += 1) {
    nodes.push({ id: `competitor-${index}`, x: offerX + S.offer.w + LANE, y: Math.round((top - competitorsHeight) / 2) + index * (S.competitor.h + GAP), ...S.competitor });
    edges.push({ from: "offer", to: `competitor-${index}`, dir: "across" });
  }
  for (let index = 0; index < input.changes; index += 1) {
    nodes.push({ id: `change-${index}`, x: offerX + index * (S.change.w + GAP), y: top + LANE, ...S.change });
    edges.push({ from: "offer", to: `change-${index}`, dir: "down" });
  }
  return finish(nodes, edges);
}

export const ROADMAP_SIZES = { goal: { w: 270, h: 116 }, stall: { w: 270, h: 176 }, data: { w: 270, h: 132 }, phase: { w: 150, h: 76 }, step: { w: 300, h: 172 } } as const;

/**
 * The roadmap's board: the goal leads to where growth stalls, which branches into each phase, each followed
 * by its steps in a row. Ids: `goal`, `stall`, `data`, `phase-<key>`, `step-<index>` (the step's own index).
 */
export function roadmapBoard(input: { goal: boolean; phases: { key: string; steps: number[] }[] }): Board {
  const S = ROADMAP_SIZES;
  const nodes: BoardNode[] = [];
  const edges: BoardEdge[] = [];
  let y = 0;
  if (input.goal) {
    nodes.push({ id: "goal", x: 0, y, ...S.goal });
    edges.push({ from: "goal", to: "stall", dir: "down" });
    y += S.goal.h + 50;
  }
  nodes.push({ id: "stall", x: 0, y, ...S.stall });
  y += S.stall.h + 50;
  nodes.push({ id: "data", x: 0, y, ...S.data });
  const phaseX = S.stall.w + LANE;
  input.phases.forEach((phase, row) => {
    const rowY = row * (S.step.h + 44);
    nodes.push({ id: `phase-${phase.key}`, x: phaseX, y: rowY + Math.round((S.step.h - S.phase.h) / 2), ...S.phase });
    edges.push({ from: "stall", to: `phase-${phase.key}`, dir: "across" });
    phase.steps.forEach((step, index) => {
      nodes.push({ id: `step-${step}`, x: phaseX + S.phase.w + 36 + index * (S.step.w + 36), y: rowY, ...S.step });
      edges.push({ from: index === 0 ? `phase-${phase.key}` : `step-${phase.steps[index - 1]}`, to: `step-${step}`, dir: "across" });
    });
  });
  return finish(nodes, edges);
}

/** The line joining two cards, as an SVG path with square corners. */
export function edgePath(board: Board, edge: BoardEdge): string {
  const from = board.nodes.find((node) => node.id === edge.from);
  const to = board.nodes.find((node) => node.id === edge.to);
  if (!from || !to) return "";
  if (edge.dir === "across") {
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const mid = Math.round(x1 + (x2 - x1) / 2);
    return y1 === y2 ? `M${x1} ${y1}H${x2}` : `M${x1} ${y1}H${mid}V${y2}H${x2}`;
  }
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  const mid = Math.round(y1 + (y2 - y1) / 2);
  return x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}V${mid}H${x2}V${y2}`;
}

/** The zoom and offset that show the whole board inside a box, never enlarged past 100%. */
export function fitBoard(board: Pick<Board, "width" | "height">, box: { width: number; height: number }, pad = 24) {
  if (!board.width || !board.height || !box.width || !box.height) return { k: 1, x: pad, y: pad };
  const k = Math.min(1, (box.width - pad * 2) / board.width, (box.height - pad * 2) / board.height);
  const scale = Math.max(0.2, k);
  return { k: scale, x: Math.round((box.width - board.width * scale) / 2), y: Math.round(Math.max(pad, (box.height - board.height * scale) / 2)) };
}
