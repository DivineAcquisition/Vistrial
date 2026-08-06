import "server-only";

import { monthStart } from "@/lib/billing/minimum";
import { round2 } from "@/lib/billing/minimum";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  Charge,
  ChargeAttempt,
  ChargeLine,
  ChargeNotification,
  ChargeStatus,
  Client,
  Credit,
  JobRun,
  JobRunEntry,
} from "@/types/database";

export type ChargeRecord = Charge & {
  client: Pick<Client, "id" | "name" | "card_brand" | "card_last4" | "contact_email"> | null;
  lines: ChargeLine[] | null;
  notifications: ChargeNotification[] | null;
  attempts_log: ChargeAttempt[] | null;
  credits: Credit[] | null;
};

const SELECT = `
  *,
  client:clients(id, name, card_brand, card_last4, contact_email),
  lines:charge_lines(*),
  notifications:charge_notifications(*),
  attempts_log:charge_attempts(*),
  credits:credits!credits_applied_charge_id_fkey(*)
`;

const MAX_ROWS = 300;

export type ChargeFilters = {
  clientId?: string;
  status?: ChargeStatus;
  from?: string;
  to?: string;
};

function order(record: ChargeRecord): ChargeRecord {
  return {
    ...record,
    lines: [...(record.lines ?? [])].sort((a, b) => a.sort - b.sort),
    notifications: [...(record.notifications ?? [])].sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    ),
    attempts_log: [...(record.attempts_log ?? [])].sort((a, b) => a.attempt_no - b.attempt_no),
    credits: record.credits ?? [],
  };
}

export async function listCharges(filters: ChargeFilters = {}): Promise<ChargeRecord[]> {
  const supabase = createServiceClient();

  let query = supabase.from("charges").select(SELECT);

  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("period_end", filters.from);
  if (filters.to) query = query.lte("period_start", filters.to);

  const { data, error } = await query
    .order("period_end", { ascending: false })
    .limit(MAX_ROWS)
    .returns<ChargeRecord[]>();

  if (error) {
    throw new Error(`Failed to list charges: ${error.message}`);
  }

  return (data ?? []).map(order);
}

export type BillingMetrics = {
  billedThisMonth: number;
  collectedThisMonth: number;
  outstanding: number;
  lockedNotCharged: number;
  lockedCount: number;
};

/** Appointments out of their review window and not yet on a charge. */
async function lockedValue(): Promise<{ total: number; count: number }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("appointments")
    .select("id, client:clients(rate_per_appointment)")
    .eq("status", "confirmed")
    .is("charge_id", null)
    .lte("review_window_ends_at", new Date().toISOString())
    .returns<{ id: string; client: { rate_per_appointment: number } | null }[]>();

  if (error) {
    throw new Error(`Failed to value the locked appointments: ${error.message}`);
  }

  const rows = data ?? [];

  return {
    count: rows.length,
    total: round2(
      rows.reduce((sum, row) => sum + Number(row.client?.rate_per_appointment ?? 0), 0)
    ),
  };
}

export async function billingMetrics(): Promise<BillingMetrics> {
  const supabase = createServiceClient();
  const month = monthStart(new Date().toISOString().slice(0, 10));

  const [{ data: charges, error }, locked] = await Promise.all([
    supabase
      .from("charges")
      .select("total, status, created_at, processed_at")
      .returns<Pick<Charge, "total" | "status" | "created_at" | "processed_at">[]>(),
    lockedValue(),
  ]);

  if (error) {
    throw new Error(`Failed to read the billing totals: ${error.message}`);
  }

  const rows = charges ?? [];
  const inMonth = (value: string | null) => value !== null && value.slice(0, 7) === month.slice(0, 7);

  return {
    billedThisMonth: round2(
      rows
        .filter((row) => inMonth(row.created_at))
        .reduce((sum, row) => sum + Number(row.total), 0)
    ),
    collectedThisMonth: round2(
      rows
        .filter((row) => row.status === "paid" && inMonth(row.processed_at))
        .reduce((sum, row) => sum + Number(row.total), 0)
    ),
    outstanding: round2(
      rows
        .filter((row) => row.status !== "paid")
        .reduce((sum, row) => sum + Number(row.total), 0)
    ),
    lockedNotCharged: locked.total,
    lockedCount: locked.count,
  };
}

/* -------------------------------------------------------------------------- */
/* The attention view                                                          */
/* -------------------------------------------------------------------------- */

export type AttentionItem = {
  id: string;
  severity: "critical" | "warning";
  /** Lower sorts higher. A chargeback outranks everything else here. */
  priority?: number;
  clientId: string | null;
  clientName: string;
  headline: string;
  detail: string;
  /** How long this has been true, in whole days. Prominence escalates with it. */
  ageDays: number | null;
  href: string;
};

function daysSince(value: string | null): number | null {
  if (value === null) return null;
  return Math.floor((Date.now() - Date.parse(value)) / (24 * 60 * 60 * 1000));
}

/**
 * A failed payment that goes unnoticed for three weeks is a client who has
 * quietly left, so everything that needs a person is gathered in one place and
 * gets louder the longer it sits there.
 */
export async function attentionItems(): Promise<AttentionItem[]> {
  const supabase = createServiceClient();
  const items: AttentionItem[] = [];

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .neq("status", "Churned")
    .returns<Client[]>();

  const soon = new Date();
  soon.setUTCDate(soon.getUTCDate() + 30);

  for (const client of clients ?? []) {
    if (client.stripe_payment_method_id === null) {
      items.push({
        id: `no-method-${client.id}`,
        severity: client.status === "Active" ? "critical" : "warning",
        clientId: client.id,
        clientName: client.name,
        headline: "No payment method on file",
        detail:
          "Appointments still accumulate and will be charged once a method exists, but nothing can be collected until it does.",
        ageDays: daysSince(client.created_at),
        href: `/clients/${client.id}`,
      });
    } else if (client.card_exp_month !== null && client.card_exp_year !== null) {
      // A card that expires between now and the next cycle is a failed cycle
      // discovered at the worst possible moment.
      const expiry = new Date(
        Date.UTC(client.card_exp_year, client.card_exp_month, 0, 23, 59, 59)
      );

      if (expiry <= soon) {
        items.push({
          id: `expiring-${client.id}`,
          severity: expiry <= new Date() ? "critical" : "warning",
          clientId: client.id,
          clientName: client.name,
          headline:
            expiry <= new Date() ? "Payment method has expired" : "Payment method expires soon",
          detail: `${client.card_brand ?? "Card"} ending ${client.card_last4 ?? "????"} expires ${String(
            client.card_exp_month
          ).padStart(2, "0")}/${client.card_exp_year}.`,
          ageDays: null,
          href: `/clients/${client.id}`,
        });
      }
    }

    if (client.contact_email === null) {
      items.push({
        id: `no-email-${client.id}`,
        severity: "critical",
        clientId: client.id,
        clientName: client.name,
        headline: "No contact email",
        detail:
          "Neither the appointment confirmations nor the pre-charge itemisation can be delivered, and neither an appointment nor a charge can be settled without them.",
        ageDays: daysSince(client.created_at),
        href: `/clients/${client.id}`,
      });
    }
  }

  const byId = new Map((clients ?? []).map((client) => [client.id, client.name]));

  const { data: charges } = await supabase
    .from("charges")
    .select("*, notifications:charge_notifications(kind, status, error, created_at)")
    .neq("status", "paid")
    .returns<
      (Charge & {
        notifications: { kind: string; status: string; error: string | null }[] | null;
      })[]
    >();

  for (const charge of charges ?? []) {
    const name = byId.get(charge.client_id) ?? "Unknown client";

    if (charge.status === "failed") {
      items.push({
        id: `failed-${charge.id}`,
        severity: "critical",
        clientId: charge.client_id,
        clientName: name,
        headline: `Payment failed after ${charge.attempts} attempt${charge.attempts === 1 ? "" : "s"}`,
        detail:
          charge.failure_reason ??
          "The processor gave no reason. The appointments stay locked for the next charge.",
        ageDays: daysSince(charge.last_attempt_at),
        href: `/billing?charge=${charge.id}`,
      });
      continue;
    }

    const notice = (charge.notifications ?? []).find((row) => row.kind === "pre_charge");

    if (charge.status === "draft" && notice?.status === "failed") {
      items.push({
        id: `undelivered-${charge.id}`,
        severity: "critical",
        clientId: charge.client_id,
        clientName: name,
        headline: "Itemisation never reached the client",
        detail: `${notice.error ?? "Delivery failed."} The charge is holding and will not process.`,
        ageDays: daysSince(charge.created_at),
        href: `/billing?charge=${charge.id}`,
      });
    }
  }

  // A chargeback lands on a charge that is already paid, so it is not in the
  // sweep above — and it is the single loudest thing that can happen here.
  const { data: reversed } = await supabase
    .from("charges")
    .select("*")
    .not("chargeback_status", "is", null)
    .neq("chargeback_status", "won")
    .returns<Charge[]>();

  for (const charge of reversed ?? []) {
    items.push({
      id: `chargeback-${charge.id}`,
      severity: "critical",
      priority: 0,
      clientId: charge.client_id,
      clientName: byId.get(charge.client_id) ?? "Unknown client",
      headline:
        charge.chargeback_status === "lost"
          ? "Chargeback lost"
          : charge.chargeback_status === "warning"
            ? "Chargeback warning"
            : "Chargeback opened",
      detail: `${
        charge.chargeback_reason ?? "The cardholder disputed this payment with their bank."
      } Respond through Stripe; this threatens payment processing access, not just this charge.`,
      ageDays: daysSince(charge.chargeback_at),
      href: `/billing?charge=${charge.id}`,
    });
  }

  const bySeverity = { critical: 1, warning: 2 };
  const rank = (item: AttentionItem) => item.priority ?? bySeverity[item.severity];

  return items.sort((a, b) => rank(a) - rank(b) || (b.ageDays ?? 0) - (a.ageDays ?? 0));
}

export async function countAttention(): Promise<number> {
  try {
    return (await attentionItems()).length;
  } catch {
    // The sidebar renders on every page and must not take the shell down.
    return 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Per client                                                                  */
/* -------------------------------------------------------------------------- */

export type NextCharge = {
  closesOn: string | null;
  lockedCount: number;
  lockedValue: number;
  inWindowCount: number;
};

/** The running value of the next charge: the number a client checks most. */
export async function nextChargeFor(client: Client): Promise<NextCharge> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("appointments")
    .select("id, review_window_ends_at")
    .eq("client_id", client.id)
    .eq("status", "confirmed")
    .is("charge_id", null)
    .returns<{ id: string; review_window_ends_at: string | null }[]>();

  if (error) {
    throw new Error(`Failed to value the next charge: ${error.message}`);
  }

  const now = Date.now();
  const rows = data ?? [];
  const locked = rows.filter(
    (row) => row.review_window_ends_at !== null && Date.parse(row.review_window_ends_at) <= now
  );

  return {
    closesOn: client.next_cycle_close,
    lockedCount: locked.length,
    lockedValue: round2(locked.length * Number(client.rate_per_appointment)),
    inWindowCount: rows.length - locked.length,
  };
}

export async function listCredits(clientId: string): Promise<Credit[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("credits")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .returns<Credit[]>();

  if (error) {
    throw new Error(`Failed to list credits: ${error.message}`);
  }

  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/* The job log                                                                 */
/* -------------------------------------------------------------------------- */

export type JobRunRecord = JobRun & { entries: JobRunEntry[] | null };

export async function listJobRuns(limit = 10): Promise<JobRunRecord[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("job_runs")
    .select("*, entries:job_run_entries(*)")
    .order("started_at", { ascending: false })
    .limit(limit)
    .returns<JobRunRecord[]>();

  if (error) {
    throw new Error(`Failed to read the job log: ${error.message}`);
  }

  return (data ?? []).map((run) => ({
    ...run,
    entries: [...(run.entries ?? [])].sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    ),
  }));
}
