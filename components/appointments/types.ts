import type { AppointmentView } from "@/lib/db/appointments";
import type { Billability, ReviewWindow } from "@/lib/appointments/review-window";
import type { TouchEntry } from "@/components/leads/types";
import type {
  AppointmentActor,
  AppointmentEventKind,
  AppointmentStatus,
  BookingSource,
  DisputeOutcome,
  DisputeRaisedBy,
  LeadOrigin,
  LeadSource,
  NotificationStatus,
} from "@/types/database";

export type DefinitionView = {
  version: number;
  criteria: string;
  serviceArea: string | null;
  acceptedJobTypes: string[];
  effectiveFrom: string;
};

export type HistoryEntry = {
  id: string;
  kind: AppointmentEventKind;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus | null;
  previousScheduledFor: string | null;
  newScheduledFor: string | null;
  showed: boolean | null;
  actor: AppointmentActor;
  actorLabel: string | null;
  reason: string | null;
  occurredAt: string;
};

export type DisputeEntry = {
  id: string;
  raisedBy: DisputeRaisedBy;
  raisedAt: string;
  reason: string;
  outcome: DisputeOutcome | null;
  outcomeReason: string | null;
  resolvedAt: string | null;
};

export type NotificationEntry = {
  id: string;
  status: NotificationStatus;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  error: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
};

/** Everything the table, the queue, and the evidence panel need. */
export type AppointmentRow = {
  id: string;
  clientId: string;
  clientName: string;
  billOn: "booked" | "showed";
  scheduledFor: string;
  appointmentType: string | null;
  status: AppointmentStatus;
  definitionVersion: number;
  rate: number | null;
  currentRate: number | null;
  window: ReviewWindow;
  billable: Billability;
  showed: boolean | null;
  showRecordedAt: string | null;
  awaitingOutcome: boolean;
  bookingSource: BookingSource;
  rescheduleCount: number;
  previousScheduledFor: string | null;
  rejectedReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    jobType: string | null;
    arrivedAt: string;
    origin: LeadOrigin;
    source: LeadSource;
    campaignName: string | null;
  } | null;
  systemMs: number | null;
  humanMs: number | null;
  gapMs: number | null;
  touches: TouchEntry[];
  definition: DefinitionView | null;
  history: HistoryEntry[];
  disputes: DisputeEntry[];
  openDispute: DisputeEntry | null;
  notifications: NotificationEntry[];
};

export function toAppointmentRow(view: AppointmentView): AppointmentRow {
  const disputes: DisputeEntry[] = (view.disputes ?? []).map((dispute) => ({
    id: dispute.id,
    raisedBy: dispute.raised_by,
    raisedAt: dispute.raised_at,
    reason: dispute.reason,
    outcome: dispute.outcome,
    outcomeReason: dispute.outcome_reason,
    resolvedAt: dispute.resolved_at,
  }));

  return {
    id: view.id,
    clientId: view.client_id,
    clientName: view.client?.name ?? "Unattributed",
    billOn: view.client?.bill_on ?? "booked",
    scheduledFor: view.scheduled_for,
    appointmentType: view.appointment_type,
    status: view.status,
    definitionVersion: view.definition_version,
    rate: view.rate_applied,
    currentRate: view.client?.rate_per_appointment ?? null,
    window: view.window,
    billable: view.billable,
    showed: view.showed,
    showRecordedAt: view.show_recorded_at,
    awaitingOutcome: view.awaitingOutcome,
    bookingSource: view.booking_source,
    rescheduleCount: view.reschedule_count,
    previousScheduledFor: view.previous_scheduled_for,
    rejectedReason: view.rejected_reason,
    createdAt: view.created_at,
    confirmedAt: view.confirmed_at,
    lead: view.lead
      ? {
          id: view.lead.id,
          name: view.lead.name,
          phone: view.lead.phone,
          email: view.lead.email,
          jobType: view.lead.job_type,
          arrivedAt: view.lead.arrived_at,
          origin: view.lead.origin,
          source: view.lead.source,
          campaignName: view.lead.campaign?.name ?? null,
        }
      : null,
    systemMs: view.response.systemMs,
    humanMs: view.response.humanMs,
    gapMs: view.response.gapMs,
    touches: (view.lead?.touches ?? []).map((touch) => ({
      id: touch.id,
      type: touch.touch_type,
      channel: touch.channel,
      occurredAt: touch.occurred_at,
      isFirstOfType: touch.is_first_of_type,
    })),
    definition: view.definition
      ? {
          version: view.definition.version,
          criteria: view.definition.criteria,
          serviceArea: view.definition.service_area,
          acceptedJobTypes: view.definition.accepted_job_types ?? [],
          effectiveFrom: view.definition.effective_from,
        }
      : null,
    history: (view.events ?? []).map((event) => ({
      id: event.id,
      kind: event.kind,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      previousScheduledFor: event.previous_scheduled_for,
      newScheduledFor: event.new_scheduled_for,
      showed: event.showed,
      actor: event.actor,
      actorLabel: event.actor_label,
      reason: event.reason,
      occurredAt: event.occurred_at,
    })),
    disputes,
    openDispute: disputes.find((dispute) => dispute.outcome === null) ?? null,
    notifications: (view.notifications ?? []).map((notification) => ({
      id: notification.id,
      status: notification.status,
      recipient: notification.recipient,
      subject: notification.subject,
      body: notification.body,
      error: notification.error,
      attempts: notification.attempts,
      sentAt: notification.sent_at,
      createdAt: notification.created_at,
    })),
  };
}
