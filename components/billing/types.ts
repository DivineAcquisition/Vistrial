import type { ChargeRecord } from "@/lib/db/billing";
import type {
  ChargeLineKind,
  ChargeNotificationKind,
  ChargeStatus,
  NotificationStatus,
  PaymentOutcome,
} from "@/types/database";

export type LineRow = {
  id: string;
  kind: ChargeLineKind;
  description: string;
  amount: number;
};

export type NoticeRow = {
  id: string;
  kind: ChargeNotificationKind;
  status: NotificationStatus;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  error: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
};

export type AttemptRow = {
  id: string;
  attemptNo: number;
  attemptedAt: string;
  outcome: PaymentOutcome;
  reference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type CreditRow = {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
  createdByLabel: string | null;
  appliedAt: string | null;
};

export type ChargeRow = {
  id: string;
  clientId: string;
  clientName: string;
  card: string | null;
  periodStart: string;
  periodEnd: string;
  appointmentCount: number;
  subtotal: number;
  minimumAdjustment: number;
  creditsApplied: number;
  total: number;
  status: ChargeStatus;
  notifiedAt: string | null;
  scheduledFor: string | null;
  processedAt: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  failureReason: string | null;
  reference: string | null;
  mode: "live" | "test" | null;
  chargeback: {
    at: string;
    status: string;
    reason: string | null;
    amount: number | null;
    reference: string | null;
  } | null;
  createdAt: string;
  lines: LineRow[];
  notices: NoticeRow[];
  attemptLog: AttemptRow[];
  credits: CreditRow[];
};

export function toChargeRow(record: ChargeRecord): ChargeRow {
  return {
    id: record.id,
    clientId: record.client_id,
    clientName: record.client?.name ?? "Unknown client",
    card:
      record.client?.card_brand && record.client?.card_last4
        ? `${record.client.card_brand} ending ${record.client.card_last4}`
        : null,
    periodStart: record.period_start,
    periodEnd: record.period_end,
    appointmentCount: record.appointment_count,
    subtotal: Number(record.appointments_subtotal),
    minimumAdjustment: Number(record.minimum_adjustment),
    creditsApplied: Number(record.credits_applied),
    total: Number(record.total),
    status: record.status,
    notifiedAt: record.notified_at,
    scheduledFor: record.scheduled_for,
    processedAt: record.processed_at,
    attempts: record.attempts,
    nextAttemptAt: record.next_attempt_at,
    failureReason: record.failure_reason,
    reference: record.stripe_payment_intent_id,
    mode: record.processor_mode,
    chargeback:
      record.chargeback_at === null
        ? null
        : {
            at: record.chargeback_at,
            status: record.chargeback_status ?? "open",
            reason: record.chargeback_reason,
            amount:
              record.chargeback_amount === null ? null : Number(record.chargeback_amount),
            reference: record.chargeback_reference,
          },
    createdAt: record.created_at,
    lines: (record.lines ?? []).map((line) => ({
      id: line.id,
      kind: line.kind,
      description: line.description,
      amount: Number(line.amount),
    })),
    notices: (record.notifications ?? []).map((notice) => ({
      id: notice.id,
      kind: notice.kind,
      status: notice.status,
      recipient: notice.recipient,
      subject: notice.subject,
      body: notice.body,
      error: notice.error,
      attempts: notice.attempts,
      sentAt: notice.sent_at,
      createdAt: notice.created_at,
    })),
    attemptLog: (record.attempts_log ?? []).map((attempt) => ({
      id: attempt.id,
      attemptNo: attempt.attempt_no,
      attemptedAt: attempt.attempted_at,
      outcome: attempt.outcome,
      reference: attempt.processor_reference,
      failureCode: attempt.failure_code,
      failureMessage: attempt.failure_message,
    })),
    credits: (record.credits ?? []).map((credit) => ({
      id: credit.id,
      amount: Number(credit.amount),
      reason: credit.reason,
      createdAt: credit.created_at,
      createdByLabel: credit.created_by_label,
      appliedAt: credit.applied_at,
    })),
  };
}

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  draft: "Holding",
  notified: "Notified",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  credited: "Credited",
};

export const CHARGE_STATUS_MEANINGS: Record<ChargeStatus, string> = {
  draft: "Assembled but the client has not been told yet, so it cannot process.",
  notified: "The client has the itemisation. Payment is scheduled.",
  processing: "A payment attempt is in flight.",
  paid: "Collected. The appointments on it are locked permanently.",
  failed: "The payment did not go through. The appointments stay locked for the next charge.",
  credited: "Settled by a credit.",
};
