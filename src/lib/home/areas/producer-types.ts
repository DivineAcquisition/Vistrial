import type { GhlDb } from "@/lib/ghl/tokens";
import type { GateState } from "@/lib/home/gate";
import type { QueueDraft } from "@/lib/home/queue";

export type ProducerOrg = {
  id: string;
  name: string;
  timezone: string;
  /** Whole-workspace stop on anything Vistrial does on its own. */
  halted: boolean;
  /** Stop on writes that leave Vistrial through the CRM, messages included. */
  crmHalted: boolean;
};

export type ProducerContext = {
  db: GhlDb;
  org: ProducerOrg;
  gate: GateState;
  now: Date;
};

/** What a producer hands back. The scanner decides whether it waits or runs. */
export type NewQueueItem = {
  kind: string;
  actionType: string;
  title: string;
  preview: string;
  reason: string;
  assignedMemberId: string | null;
  drafts: QueueDraft[];
};

/** Finds work for one area in one workspace. Drafts only; never sends. */
export type AreaProducer = (context: ProducerContext) => Promise<NewQueueItem[]>;
