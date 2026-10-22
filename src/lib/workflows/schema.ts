import { z } from "zod";

import {
  BOOKING_EVENTS,
  CHECK_KINDS,
  DEFAULT_LIMITS,
  EDGE_EXITS,
  END_REASONS,
  ENTRY_TRIGGERS,
  TIERS,
  type WorkflowGraph,
} from "@/lib/workflows/types";

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const words = (max: number) => z.string().max(max);

const config = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("start"),
    trigger: z.enum(ENTRY_TRIGGERS),
    stage: words(120).optional(),
    days: z.number().int().optional(),
    bookingEvent: z.enum(BOOKING_EVENTS).optional(),
    tier: z.enum(TIERS).optional(),
    sources: z.array(words(120)).max(20).optional(),
  }),
  z.object({
    kind: z.literal("wait"),
    amount: z.number().finite(),
    unit: z.enum(["hours", "days"]),
    atTime: words(5).optional(),
  }),
  z.object({
    kind: z.literal("check"),
    check: z.enum(CHECK_KINDS),
    value: words(200).optional(),
    yesLabel: words(60),
    noLabel: words(60),
  }),
  z.object({
    kind: z.literal("draft"),
    channel: z.enum(["text", "email"]).nullable(),
    contentKind: z.enum(["snippet", "talk_track"]),
    contentRef: words(120).nullable(),
    windowHours: z.number().finite(),
  }),
  z.object({
    kind: z.literal("task"),
    text: words(300),
    dueHours: z.number().finite(),
    assignee: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("lead_owner") }),
      z.object({ kind: z.literal("person"), memberId: words(64) }),
      z.object({ kind: z.literal("role"), role: words(40) }),
    ]),
    alert: z.boolean(),
  }),
  z.object({ kind: z.literal("route"), mode: z.enum(["assign_unowned", "reassign"]) }),
  z.object({ kind: z.literal("end"), reason: z.enum(END_REASONS), handOffTo: words(64).optional() }),
  z.object({ kind: z.literal("note"), text: words(500) }),
]);

/**
 * The only shape a saved workflow may take. Boxes and settings outside this
 * list are refused before anything reaches the database, whoever drew them.
 * The checker then decides whether the shape is safe to publish.
 */
export const workflowGraphSchema = z.object({
  boxes: z.array(z.object({ id, config })).max(DEFAULT_LIMITS.maxBoxes),
  edges: z
    .array(
      z.object({
        id,
        from: id,
        to: id,
        exit: z.enum(EDGE_EXITS),
        maxPasses: z.number().int().min(1).max(DEFAULT_LIMITS.maxLoopPasses).optional(),
      })
    )
    .max(DEFAULT_LIMITS.maxBoxes * 3),
});

export function parseWorkflowGraph(value: unknown): { ok: true; graph: WorkflowGraph } | { ok: false; message: string } {
  const result = workflowGraphSchema.safeParse(value);
  if (!result.success) return { ok: false, message: "This workflow has a box or setting Vistrial does not allow." };
  return { ok: true, graph: result.data as WorkflowGraph };
}
