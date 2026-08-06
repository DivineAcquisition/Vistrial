/**
 * The cycle job.
 *
 * Runs at least daily and is safe to run more often. Nothing it does depends on
 * running exactly once: assembly is bounded by the overlapping-period
 * constraint, notification only fires on a draft charge, and payment claims the
 * charge with a conditional update before it touches the processor.
 *
 * Every run is recorded, including the clients it skipped and why, because a
 * cycle that silently did not run is a week of revenue that quietly did not
 * happen.
 */

import { assembleCharge } from "@/lib/billing/assembly";
import { today, type Day } from "@/lib/billing/cycle";
import {
  MAX_ATTEMPTS,
  processCharge,
  sendPreChargeNotice,
  type PaymentPort,
} from "@/lib/billing/processing";
import { formatMoney } from "@/lib/format";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { Charge, Client, JobAction } from "@/types/database";

export type JobEntry = {
  action: JobAction;
  detail: string;
  clientId?: string | null;
  chargeId?: string | null;
};

export type JobSummary = {
  runId: string | null;
  assembled: number;
  notified: number;
  processed: number;
  failed: number;
  skipped: number;
  entries: JobEntry[];
  error: string | null;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runCycleJob(
  db: LedgerDb,
  options: { now?: Date; trigger?: "schedule" | "manual"; pay?: PaymentPort } = {}
): Promise<JobSummary> {
  const now = options.now ?? new Date();
  const on: Day = today(now);
  const nowIso = now.toISOString();

  const { data: run } = await db
    .from("job_runs")
    .insert({ kind: "cycle", trigger: options.trigger ?? "schedule", started_at: nowIso })
    .select("id")
    .returns<{ id: string }[]>()
    .maybeSingle();

  const runId = run?.id ?? null;
  const entries: JobEntry[] = [];
  const summary = { assembled: 0, notified: 0, processed: 0, failed: 0, skipped: 0 };
  let error: string | null = null;

  const record = (entry: JobEntry) => {
    entries.push(entry);
    if (entry.action === "skipped") summary.skipped += 1;
    if (entry.action === "assembled") summary.assembled += 1;
    if (entry.action === "notified") summary.notified += 1;
    if (entry.action === "processed") summary.processed += 1;
    if (entry.action === "failed") summary.failed += 1;
  };

  try {
    await assembleDueCycles(db, on, nowIso, record);
    await notifyDraftCharges(db, now, record);
    await processScheduledCharges(db, now, record, options.pay);
    await retryFailedCharges(db, now, record, options.pay);
  } catch (thrown) {
    error = message(thrown);
  }

  if (runId !== null) {
    for (const entry of entries) {
      await db.from("job_run_entries").insert({
        run_id: runId,
        client_id: entry.clientId ?? null,
        charge_id: entry.chargeId ?? null,
        action: entry.action,
        detail: entry.detail,
      });
    }

    await db
      .from("job_runs")
      .update({ finished_at: new Date().toISOString(), ...summary, error })
      .eq("id", runId);
  }

  return { runId, ...summary, entries, error };
}

async function assembleDueCycles(
  db: LedgerDb,
  on: Day,
  nowIso: string,
  record: (entry: JobEntry) => void
): Promise<void> {
  const { data: clients } = await db
    .from("clients")
    .select("*")
    .eq("status", "Active")
    .lte("next_cycle_close", on)
    .returns<Client[]>();

  for (const client of clients ?? []) {
    try {
      const result = await assembleCharge(db, client, on, nowIso);

      if (result.kind === "skipped") {
        record({ action: "skipped", detail: result.reason, clientId: client.id });
        continue;
      }

      record({
        action: "assembled",
        clientId: client.id,
        chargeId: result.charge.id,
        detail: `${result.appointments} appointment${
          result.appointments === 1 ? "" : "s"
        } for ${result.period.start} to ${result.period.end}, totalling ${formatMoney(
          Number(result.charge.total)
        )}.`,
      });
    } catch (thrown) {
      record({
        action: "skipped",
        clientId: client.id,
        detail: `Assembly failed: ${message(thrown)}`,
      });
    }
  }
}

async function notifyDraftCharges(
  db: LedgerDb,
  now: Date,
  record: (entry: JobEntry) => void
): Promise<void> {
  const { data: charges } = await db
    .from("charges")
    .select("id, client_id")
    .eq("status", "draft")
    .returns<Pick<Charge, "id" | "client_id">[]>();

  for (const charge of charges ?? []) {
    const result = await sendPreChargeNotice(db, charge.id, now);

    if (result.kind === "notified") {
      record({
        action: "notified",
        clientId: charge.client_id,
        chargeId: charge.id,
        detail: `Itemisation sent. Payment is scheduled for ${result.scheduledFor}.`,
      });
      continue;
    }

    record({
      action: "skipped",
      clientId: charge.client_id,
      chargeId: charge.id,
      detail:
        result.kind === "undelivered"
          ? `Holding: the itemisation did not reach the client. ${result.reason}`
          : result.reason,
    });
  }
}

async function processScheduledCharges(
  db: LedgerDb,
  now: Date,
  record: (entry: JobEntry) => void,
  pay?: PaymentPort
): Promise<void> {
  const { data: charges } = await db
    .from("charges")
    .select("id, client_id")
    .eq("status", "notified")
    .lte("scheduled_for", now.toISOString())
    .returns<Pick<Charge, "id" | "client_id">[]>();

  for (const charge of charges ?? []) {
    await attempt(db, charge, now, "notified", record, pay);
  }
}

async function retryFailedCharges(
  db: LedgerDb,
  now: Date,
  record: (entry: JobEntry) => void,
  pay?: PaymentPort
): Promise<void> {
  const { data: charges } = await db
    .from("charges")
    .select("id, client_id, attempts")
    .eq("status", "failed")
    .lte("next_attempt_at", now.toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .returns<Pick<Charge, "id" | "client_id" | "attempts">[]>();

  for (const charge of charges ?? []) {
    await attempt(db, charge, now, "failed", record, pay);
  }
}

async function attempt(
  db: LedgerDb,
  charge: Pick<Charge, "id" | "client_id">,
  now: Date,
  from: "notified" | "failed",
  record: (entry: JobEntry) => void,
  pay?: PaymentPort
): Promise<void> {
  try {
    const result = await processCharge(db, charge.id, now, from, pay);

    if (result.kind === "paid") {
      record({
        action: "processed",
        clientId: charge.client_id,
        chargeId: charge.id,
        detail: `Collected ${formatMoney(result.total)}. Reference ${result.reference}.`,
      });
      return;
    }

    if (result.kind === "failed") {
      record({
        action: "failed",
        clientId: charge.client_id,
        chargeId: charge.id,
        detail: result.final
          ? `${result.reason} That was the last automatic attempt; the appointments stay confirmed and locked for the next charge.`
          : `${result.reason} Next attempt ${result.nextAttempt}.`,
      });
      return;
    }

    record({
      action: "skipped",
      clientId: charge.client_id,
      chargeId: charge.id,
      detail: result.reason,
    });
  } catch (thrown) {
    record({
      action: "skipped",
      clientId: charge.client_id,
      chargeId: charge.id,
      detail: `${from === "failed" ? "Retry" : "Processing"} failed: ${message(thrown)}`,
    });
  }
}
