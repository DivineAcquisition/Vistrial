/**
 * The daily attention digest.
 *
 * Sends only when something is outstanding. An empty morning produces no email
 * — a daily mail that is usually empty gets filtered, and then the one that
 * matters is missed too.
 */

import { TYPE_LABEL, type AttentionItem, type AttentionType } from "@/lib/attention/types";
import { formatMoney } from "@/lib/format";
import { sendEmail } from "@/lib/notifications/email";
import type { LedgerDb } from "@/lib/supabase/ledger";

export const DIGEST_HOUR_KEY = "attention_digest_hour_utc";
export const DEFAULT_DIGEST_HOUR = 7;

export type DigestResult =
  | { status: "sent"; itemCount: number; valueAtRisk: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

export async function getDigestHour(db: LedgerDb): Promise<number> {
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", DIGEST_HOUR_KEY)
    .maybeSingle();

  const parsed = Number(data?.value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    return DEFAULT_DIGEST_HOUR;
  }
  return parsed;
}

export async function setDigestHour(db: LedgerDb, hour: number): Promise<void> {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("Choose an hour between 0 and 23 UTC.");
  }

  const { error } = await db.from("app_settings").upsert({
    key: DIGEST_HOUR_KEY,
    value: String(hour),
  });

  if (error) throw new Error(error.message);
}

function adminRecipient(): string | null {
  return (
    process.env.ADMIN_NOTIFY_EMAIL?.trim() ||
    process.env.NOTIFICATION_FROM?.match(/<([^>]+)>/)?.[1]?.trim() ||
    process.env.NOTIFICATION_FROM?.trim() ||
    null
  );
}

export function composeDigest(input: {
  items: AttentionItem[];
  date: string;
}): { subject: string; body: string; valueAtRisk: number; escalated: number } {
  const byType = new Map<AttentionType, number>();
  let valueAtRisk = 0;
  let escalated = 0;

  for (const item of input.items) {
    byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
    valueAtRisk += item.valueAtRisk;
    if (item.escalated) escalated += 1;
  }

  const lines = [...byType.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, count]) => `- ${TYPE_LABEL[type]}: ${count}`);

  const escalatedLines = input.items
    .filter((item) => item.escalated)
    .slice(0, 20)
    .map(
      (item) =>
        `  · ${TYPE_LABEL[item.type]} — ${item.clientName}: ${item.summary}`
    );

  const subject = `Vistrial attention — ${input.items.length} item${
    input.items.length === 1 ? "" : "s"
  } · ${formatMoney(valueAtRisk)} at risk`;

  const body = [
    `Attention for ${input.date} (UTC).`,
    "",
    `${input.items.length} item${input.items.length === 1 ? "" : "s"} need a look.`,
    `${escalated} escalated.`,
    `Failed-payment value at risk: ${formatMoney(
      input.items
        .filter((item) => item.type === "failed_payment")
        .reduce((sum, item) => sum + item.valueAtRisk, 0)
    )}.`,
    "",
    "By type:",
    ...lines,
    "",
    escalated > 0 ? "Escalated:" : null,
    ...(escalated > 0 ? escalatedLines : []),
    "",
    "Open the attention view in Vistrial to act.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, body, valueAtRisk, escalated };
}

/**
 * Run once per scheduler tick. Sends only when the configured UTC hour matches
 * and there is still something outstanding, and never twice for the same day.
 */
export async function runAttentionDigest(
  db: LedgerDb,
  now: Date | number = Date.now()
): Promise<DigestResult> {
  const date = new Date(now);
  const hour = date.getUTCHours();
  const digestFor = date.toISOString().slice(0, 10);
  const configured = await getDigestHour(db);

  if (hour !== configured) {
    return {
      status: "skipped",
      reason: `Configured for ${configured}:00 UTC; it is ${hour}:00.`,
    };
  }

  const { data: already } = await db
    .from("attention_digests")
    .select("id, status")
    .eq("digest_for", digestFor)
    .in("status", ["sent", "skipped"])
    .limit(1)
    .maybeSingle();

  if (already) {
    return {
      status: "skipped",
      reason:
        already.status === "sent"
          ? "Already sent for today."
          : "Already decided for today.",
    };
  }

  const { listAttention } = await import("@/lib/attention/items");
  const { items } = await listAttention({ now: date });

  if (items.length === 0) {
    // Nothing outstanding — record the skip so a later tick the same day does
    // not keep re-querying, but do not send an empty email.
    await db.from("attention_digests").insert({
      digest_for: digestFor,
      item_count: 0,
      escalated_count: 0,
      value_at_risk: 0,
      status: "skipped",
      error: "Nothing outstanding.",
    });
    return { status: "skipped", reason: "Nothing outstanding." };
  }

  const composed = composeDigest({ items, date: digestFor });
  const recipient = adminRecipient();

  const { data: row, error: insertError } = await db
    .from("attention_digests")
    .insert({
      digest_for: digestFor,
      recipient,
      subject: composed.subject,
      body: composed.body,
      item_count: items.length,
      escalated_count: composed.escalated,
      value_at_risk: composed.valueAtRisk,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    return { status: "failed", error: insertError.message };
  }

  const delivery = await sendEmail(recipient, composed.subject, composed.body);

  await db
    .from("attention_digests")
    .update({
      status: delivery.status,
      error: delivery.error,
      sent_at: delivery.status === "sent" ? new Date(now).toISOString() : null,
    })
    .eq("id", row.id);

  if (delivery.status === "failed") {
    return { status: "failed", error: delivery.error ?? "Delivery failed." };
  }

  return {
    status: "sent",
    itemCount: items.length,
    valueAtRisk: composed.valueAtRisk,
  };
}
