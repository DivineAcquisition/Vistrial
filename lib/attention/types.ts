/**
 * The ten conditions the attention view surfaces. Priority is the band order
 * from the brief — never regrouped by feature area.
 */

export const ATTENTION_TYPES = [
  "failed_payment",
  "held_notification",
  "open_dispute",
  "pending_confirmation",
  "awaiting_human_touch",
  "no_payment_method",
  "expiring_payment_method",
  "below_minimum",
  "unresolved_inbound",
  "cycle_skipped",
] as const;

export type AttentionType = (typeof ATTENTION_TYPES)[number];

/** Lower number = higher on the list. */
export const TYPE_PRIORITY: Record<AttentionType, number> = {
  failed_payment: 1,
  held_notification: 2,
  open_dispute: 3,
  pending_confirmation: 4,
  awaiting_human_touch: 5,
  no_payment_method: 6,
  expiring_payment_method: 7,
  below_minimum: 8,
  unresolved_inbound: 9,
  cycle_skipped: 10,
};

export const TYPE_LABEL: Record<AttentionType, string> = {
  failed_payment: "Failed payment",
  held_notification: "Held charge",
  open_dispute: "Open dispute",
  pending_confirmation: "Pending confirmation",
  awaiting_human_touch: "Awaiting human touch",
  no_payment_method: "No payment method",
  expiring_payment_method: "Card expiring",
  below_minimum: "Below monthly minimum",
  unresolved_inbound: "Unresolved inbound",
  cycle_skipped: "Cycle not closed",
};

/**
 * How long before the item escalates from warning to critical. Failed payments
 * escalate immediately (threshold 0).
 */
export const ESCALATION_MS: Record<AttentionType, number> = {
  failed_payment: 0,
  awaiting_human_touch: 4 * 60 * 60 * 1000,
  open_dispute: 24 * 60 * 60 * 1000,
  pending_confirmation: 48 * 60 * 60 * 1000,
  held_notification: 72 * 60 * 60 * 1000,
  no_payment_method: 72 * 60 * 60 * 1000,
  expiring_payment_method: 72 * 60 * 60 * 1000,
  below_minimum: 72 * 60 * 60 * 1000,
  unresolved_inbound: 72 * 60 * 60 * 1000,
  cycle_skipped: 72 * 60 * 60 * 1000,
};

/** Collapse individual instances of a type when there are this many or more. */
export const COLLAPSE_AT = 3;

export type AttentionAction =
  | { kind: "retry_payment"; chargeId: string }
  | { kind: "resend_notice"; chargeId: string }
  | { kind: "uphold_dispute"; appointmentId: string }
  | { kind: "resolve_dispute"; appointmentId: string }
  | { kind: "send_payment_link"; clientId: string }
  | { kind: "link"; href: string; label: string };

export type AttentionItem = {
  id: string;
  type: AttentionType;
  clientId: string | null;
  clientName: string;
  /** When the condition began. */
  since: string;
  ageMs: number;
  escalated: boolean;
  /** One-line summary of figures / reason. */
  summary: string;
  detail: string;
  /** Money at risk for this item, if applicable. Used by the digest total. */
  valueAtRisk: number;
  actions: AttentionAction[];
};

export type AttentionRow =
  | { kind: "item"; item: AttentionItem }
  | {
      kind: "group";
      type: AttentionType;
      count: number;
      oldestAgeMs: number;
      escalated: boolean;
      items: AttentionItem[];
    };
