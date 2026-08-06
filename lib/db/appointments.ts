import "server-only";

import { billability, reviewWindow, type Billability, type ReviewWindow } from "@/lib/appointments/review-window";
import { computeResponseTimes, type ResponseTimes } from "@/lib/response-time";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  Appointment,
  AppointmentDefinition,
  AppointmentDispute,
  AppointmentEvent,
  AppointmentNotification,
  AppointmentStatus,
  BillOn,
  Campaign,
  Lead,
  Touch,
} from "@/types/database";

export type AppointmentRecord = Appointment & {
  client: {
    id: string;
    name: string;
    rate_per_appointment: number;
    bill_on: BillOn;
    review_window_hours: number;
  } | null;
  lead:
    | (Lead & {
        touches: Touch[] | null;
        campaign: Pick<Campaign, "id" | "name"> | null;
      })
    | null;
  definition: AppointmentDefinition | null;
  events: AppointmentEvent[] | null;
  disputes: AppointmentDispute[] | null;
  notifications: AppointmentNotification[] | null;
};

/** An appointment with everything derived at the moment it is read. */
export type AppointmentView = AppointmentRecord & {
  response: ResponseTimes;
  window: ReviewWindow;
  billable: Billability;
  /** The dispute currently under discussion, if there is one. */
  openDispute: AppointmentDispute | null;
  latestNotification: AppointmentNotification | null;
  /** Bills on showed, and no outcome has been reported yet. */
  awaitingOutcome: boolean;
};

const SELECT = `
  *,
  client:clients(id, name, rate_per_appointment, bill_on, review_window_hours),
  lead:leads(*, touches(*), campaign:campaigns(id, name)),
  definition:appointment_definitions(*),
  events:appointment_events(*),
  disputes:appointment_disputes(*),
  notifications:appointment_notifications(*)
`;

/** Capped rather than paginated until volume asks for it, as with leads. */
const MAX_ROWS = 500;

function byTime<T>(rows: T[], key: (row: T) => string, ascending = true): T[] {
  return [...rows].sort((a, b) => {
    const difference = Date.parse(key(a)) - Date.parse(key(b));
    return ascending ? difference : -difference;
  });
}

function decorate(record: AppointmentRecord, now: number): AppointmentView {
  const touches = record.lead?.touches ?? [];
  const notifications = byTime(record.notifications ?? [], (row) => row.created_at, false);
  const disputes = byTime(record.disputes ?? [], (row) => row.raised_at, false);
  const latestNotification = notifications[0] ?? null;

  return {
    ...record,
    lead: record.lead
      ? { ...record.lead, touches: byTime(touches, (touch) => touch.occurred_at) }
      : null,
    events: byTime(record.events ?? [], (event) => event.occurred_at),
    disputes,
    notifications,
    response: computeResponseTimes(record.lead?.arrived_at ?? record.created_at, touches),
    window: reviewWindow(record, now),
    billable: billability(
      { ...record, notificationStatus: latestNotification?.status ?? null },
      now
    ),
    openDispute: disputes.find((dispute) => dispute.outcome === null) ?? null,
    latestNotification,
    awaitingOutcome: record.client?.bill_on === "showed" && record.showed === null,
  };
}

export type AppointmentFilters = {
  clientId?: string;
  statuses?: AppointmentStatus[];
  /** Inclusive `yyyy-mm-dd` bounds on the scheduled date. */
  from?: string;
  to?: string;
  definitionVersion?: number;
};

export async function listAppointments(
  filters: AppointmentFilters = {}
): Promise<AppointmentView[]> {
  const supabase = createServiceClient();

  let query = supabase.from("appointments").select(SELECT);

  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.statuses?.length) query = query.in("status", filters.statuses);
  if (filters.from) query = query.gte("scheduled_for", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte("scheduled_for", `${filters.to}T23:59:59Z`);
  if (filters.definitionVersion !== undefined) {
    query = query.eq("definition_version", filters.definitionVersion);
  }

  const { data, error } = await query
    .order("scheduled_for", { ascending: false })
    .limit(MAX_ROWS)
    .returns<AppointmentRecord[]>();

  if (error) {
    throw new Error(`Failed to list appointments: ${error.message}`);
  }

  const now = Date.now();
  return (data ?? []).map((record) => decorate(record, now));
}

export async function getAppointment(id: string): Promise<AppointmentView | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(SELECT)
    .eq("id", id)
    .returns<AppointmentRecord[]>()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load appointment ${id}: ${error.message}`);
  }

  return data ? decorate(data, Date.now()) : null;
}

/**
 * The confirmation queue: disputes first because billing is held while they sit
 * there, then everything awaiting review, oldest first.
 */
export async function listQueue(): Promise<AppointmentView[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(SELECT)
    .in("status", ["pending", "disputed"])
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS)
    .returns<AppointmentRecord[]>();

  if (error) {
    throw new Error(`Failed to load the confirmation queue: ${error.message}`);
  }

  const now = Date.now();
  const rows = (data ?? []).map((record) => decorate(record, now));

  return [
    ...rows.filter((row) => row.status === "disputed"),
    ...rows.filter((row) => row.status !== "disputed"),
  ];
}

/** Cheap enough to run on every render of the shell. */
export async function countQueue(): Promise<number> {
  try {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "disputed"]);

    return count ?? 0;
  } catch {
    // The sidebar renders on every page; an unconfigured database must not
    // take the whole shell down with it.
    return 0;
  }
}

export type ShowStats = {
  /** Appointments that were kept, missed, or never reported on. */
  booked: number;
  showed: number;
  notShown: number;
  unreported: number;
};

/**
 * Booked but not shown, tracked regardless of billing basis. It is the single
 * most useful signal about whether a client's own process is working, and the
 * conversation it starts usually precedes a cancellation.
 */
export async function showStats(clientId?: string): Promise<ShowStats> {
  const supabase = createServiceClient();

  let query = supabase
    .from("appointments")
    .select("showed, status")
    .in("status", ["confirmed", "disputed", "billed", "rejected"]);

  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query.returns<{ showed: boolean | null }[]>();

  if (error) {
    throw new Error(`Failed to read show outcomes: ${error.message}`);
  }

  const rows = data ?? [];

  return {
    booked: rows.length,
    showed: rows.filter((row) => row.showed === true).length,
    notShown: rows.filter((row) => row.showed === false).length,
    unreported: rows.filter((row) => row.showed === null).length,
  };
}

export type AppointmentMetrics = {
  pending: number;
  awaitingOutcome: number;
  confirmedThisCycle: number;
  disputed: number;
  cycleValue: number;
};

/**
 * "This cycle" means everything confirmed and not yet assembled into a charge.
 * Charges arrive with the billing engine; until then the running value is the
 * honest answer to what the next one would contain.
 */
export function summarise(appointments: readonly AppointmentView[]): AppointmentMetrics {
  const confirmed = appointments.filter(
    (appointment) => appointment.status === "confirmed" && appointment.charge_id === null
  );

  return {
    pending: appointments.filter((appointment) => appointment.status === "pending").length,
    awaitingOutcome: appointments.filter(
      (appointment) => appointment.status === "pending" && appointment.awaitingOutcome
    ).length,
    confirmedThisCycle: confirmed.length,
    disputed: appointments.filter((appointment) => appointment.status === "disputed").length,
    // The rate is stamped when the charge is assembled, so until then the
    // client's current rate is the honest projection.
    cycleValue: confirmed.reduce(
      (total, appointment) =>
        total +
        Number(appointment.rate_applied ?? appointment.client?.rate_per_appointment ?? 0),
      0
    ),
  };
}

export type LeadOption = {
  id: string;
  client_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  arrived_at: string;
};

/** Leads an admin can record an appointment against, newest first. */
export async function listLeadOptions(): Promise<LeadOption[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("leads")
    .select("id, client_id, name, phone, email, arrived_at")
    .order("arrived_at", { ascending: false })
    .limit(MAX_ROWS)
    .returns<LeadOption[]>();

  if (error) {
    throw new Error(`Failed to list leads: ${error.message}`);
  }

  return data ?? [];
}
