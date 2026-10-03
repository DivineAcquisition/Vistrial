import type { HomeMetricId } from "@/lib/home/metrics";

/**
 * An area is one part of the business Vistrial works on: sales today; show-up,
 * retention, and client success later. Each area plugs into the home screen
 * through this one shape. The page never names an area, so adding one is a
 * new definition plus a registry line, not a page rebuild.
 *
 * Definitions are plain data and safe to import from client components. What
 * an area does on the server (finding work, running it) lives in its
 * producer, registered separately in `areas/producers.ts`.
 */

export const APPROVAL_MODES = ["ask_first", "auto_run", "off"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const APPROVERS = ["owner_only", "owners_and_managers", "assigned"] as const;
export type Approver = (typeof APPROVERS)[number];

/** Which settings heading an action sits under. */
export type ActionGroup = "people" | "internal";

export type ActionTypeDefinition = {
  /** Matches a row in public.approval_action_types. */
  id: string;
  area: string;
  group: ActionGroup;
  /** Messages a lead or a client. Only an owner may let these run unreviewed. */
  reachesPeople: boolean;
  defaultMode: ApprovalMode;
  label: string;
  /** One line under the label in settings. */
  description: string;
  /** Activity log line, e.g. "Followed up with 3 quiet leads". */
  describeDone: (count: number) => string;
};

export type QueueKindDefinition = {
  /** Stored as approval_items.kind. */
  id: string;
  actionType: string;
  /** Lower sorts first in the approval queue. */
  urgency: number;
  /** Short noun for the item's type chip. */
  label: string;
};

export type HomeArea = {
  id: string;
  label: string;
  actionTypes: ActionTypeDefinition[];
  queueKinds: QueueKindDefinition[];
  /** Numbers this area adds to the supporting grid, in order. */
  cards: HomeMetricId[];
};

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
