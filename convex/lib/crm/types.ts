/**
 * The one CRM model every skill reads and acts through, whatever CRM a business uses. HighLevel is the first
 * CRM behind it; HubSpot and Salesforce come next and fill the same shapes (docs/rebuild/dealmaker.md,
 * section 3). Pure types and small rules, so the adapters, the read view and the tests share them.
 *
 * Nothing here holds a message body, an email subject, a recording, a deal's name, notes or custom fields:
 * no adapter keeps them.
 */

import { ACTION_KINDS, type ActionKind } from "../crmActions";

/** The CRMs Vistrial knows. Only those with an adapter (`adapter.ts`) can be connected. */
export const CRM_PROVIDERS = ["highlevel", "hubspot", "salesforce"] as const;
export type CrmProvider = (typeof CRM_PROVIDERS)[number];

export function isCrmProvider(value: unknown): value is CrmProvider {
  return (CRM_PROVIDERS as readonly unknown[]).includes(value);
}

/** The approved actions, the same for every CRM. A CRM that cannot do one says so in its capabilities. */
export const CRM_ACTION_KINDS = ACTION_KINDS;
export type CrmActionKind = ActionKind;

export type CrmCapabilities = {
  /** Booked calls with a status (booked, showed, no-show, cancelled) can be read. */
  appointments: boolean;
  /** "exact" when the CRM keeps stage history; "diffed" when Vistrial finds moves by comparing reads. */
  stageHistory: "exact" | "diffed";
  /** The approved actions this CRM can carry out. */
  actions: readonly CrmActionKind[];
};

export type CrmStage = { ref: string; name: string; order: number };
export type CrmPipeline = { ref: string; name: string; stages: CrmStage[] };

export const CRM_DEAL_STATUSES = ["open", "won", "lost", "abandoned"] as const;
export type CrmDealStatus = (typeof CRM_DEAL_STATUSES)[number];

export type CrmDeal = {
  ref: string;
  pipelineRef: string;
  stageRef: string;
  status: CrmDealStatus;
  value: number;
  source: string | null;
  contactRef: string | null;
  /** The person on the business's team who owns the deal, as the CRM's own id. */
  ownerRef: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  stageChangedAt: number | null;
  statusChangedAt: number | null;
};

export type CrmContact = {
  ref: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  tags: string[];
  addedAt: number | null;
  lastActivityAt: number | null;
};

export const CRM_ACTIVITY_KINDS = ["call", "sms", "email", "chat", "social", "meeting", "stage_change", "status_change"] as const;
export type CrmActivityKind = (typeof CRM_ACTIVITY_KINDS)[number];

/** Something that happened to a lead. Facts only. */
export type CrmActivity = {
  ref: string;
  kind: CrmActivityKind;
  direction: "inbound" | "outbound" | null;
  at: number;
  contactRef: string | null;
  dealRef: string | null;
  /** A short machine value: a call status, a stage id for a move. */
  status: string | null;
  seconds: number | null;
  fromStageRef: string | null;
  toStageRef: string | null;
};

export const APPOINTMENT_STATUSES = ["booked", "confirmed", "showed", "noShow", "cancelled", "unknown"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** A booked call. */
export type CrmAppointment = {
  ref: string;
  startsAt: number;
  status: AppointmentStatus;
  contactRef: string | null;
  dealRef: string | null;
};

/** The words a CRM uses for an appointment's status, read as one of ours. Anything else is "unknown". */
export function appointmentStatusOf(raw: string | null | undefined): AppointmentStatus {
  const word = (raw ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (word === "booked" || word === "new" || word === "scheduled") return "booked";
  if (word === "confirmed") return "confirmed";
  if (word === "showed" || word === "show" || word === "completed" || word === "attended") return "showed";
  if (word === "noshow" || word === "noshowed") return "noShow";
  if (word === "cancelled" || word === "canceled" || word === "invalid" || word === "rescheduled") return "cancelled";
  return "unknown";
}
