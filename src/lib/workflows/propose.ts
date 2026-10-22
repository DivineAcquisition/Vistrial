import { checkDocument, repairOnce, type CheckContext } from "@/lib/workflows/checker";
import { tidy } from "@/lib/workflows/graph";
import { LIMITS, type Box, type Graph, type Origin, type PlaybookDocument } from "@/lib/workflows/types";

const INSTRUCTION = /ignore (all |any |the )?(previous |prior )?instructions|system prompt|you are now|do not tell/i;

/** A fact may carry a number only when the sample is large enough and the sentence names that sample. */
export function factFromSample(text: string, sample: number, min = LIMITS.minSample): string | null {
  const clean = text.replace(INSTRUCTION, "").trim();
  if (!clean || sample < min) return null;
  if (/\d/.test(clean) && !clean.includes(String(sample))) return null;
  return clean.slice(0, 280);
}

export function tagOrigin(origin: Origin, fact: string | null): { origin: Origin; fact: string | null } {
  if (origin === "data" && !fact) return { origin: "template", fact: "Using the industry default. I will learn from your results after 20 closed deals." };
  return { origin, fact };
}

/**
 * Accept a proposal only when every box is a known type and the checker
 * passes. One repair, then discard. Instructions inside a fact are dropped.
 */
export function acceptProposal(raw: unknown, context: CheckContext): PlaybookDocument | null {
  const parsed = parseProposal(raw);
  if (!parsed) return null;
  const cleaned = cleanDocument(parsed);
  const first = checkDocument(cleaned, context);
  if (first.ok) return { ...cleaned, graph: tidy(cleaned.graph) };
  const repairedGraph = repairOnce(cleaned.graph);
  if (!repairedGraph) return null;
  const repaired = { graph: tidy(repairedGraph), snippets: cleaned.snippets };
  const second = checkDocument(repaired, context);
  return second.ok ? repaired : null;
}

function cleanDocument(doc: PlaybookDocument): PlaybookDocument {
  return {
    snippets: doc.snippets,
    graph: {
      edges: doc.graph.edges,
      boxes: doc.graph.boxes.map((box) => {
        const fact = box.fact && INSTRUCTION.test(box.fact) ? null : box.fact;
        const tagged = tagOrigin(box.origin, fact);
        return { ...box, ...tagged };
      }),
    },
  };
}

function parseProposal(raw: unknown): PlaybookDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { graph?: Graph; snippets?: PlaybookDocument["snippets"] };
  if (!value.graph || !Array.isArray(value.graph.boxes) || !Array.isArray(value.graph.edges)) return null;
  const boxes: Box[] = [];
  for (const box of value.graph.boxes) {
    if (!box || typeof box !== "object") return null;
    if (!["start", "wait", "check", "draft", "task", "route", "end", "note"].includes(box.type)) return null;
    if (!box.config || box.config.type !== box.type) return null;
    boxes.push(box);
  }
  return { graph: { boxes, edges: value.graph.edges }, snippets: Array.isArray(value.snippets) ? value.snippets : [] };
}

export function draftAllowance(input: { fullRunsToday: number; lastSingleAt: string | null; now: number; single: boolean }): { ok: true } | { ok: false; message: string } {
  if (!input.single && input.fullRunsToday >= LIMITS.fullDraftsPerDay) {
    return { ok: false, message: "Compass already drew this workspace's process today. You can open that drawing again." };
  }
  if (input.single && input.lastSingleAt && input.now - Date.parse(input.lastSingleAt) < LIMITS.singleDraftGapMs) {
    return { ok: false, message: "Compass can draw one workflow an hour. The last drawing is saved." };
  }
  return { ok: true };
}
