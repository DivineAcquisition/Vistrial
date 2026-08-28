import { createHmac, timingSafeEqual } from "node:crypto";

import type { GhlDb } from "@/lib/ghl/tokens";
import type { Enums } from "@/types/database";

export type ProcessorIngest = {
  orgId: string;
  processor: "stripe" | "commas";
  kind: Enums<"revenue_kind">;
  amountCents: number;
  currency: string;
  processorRef: string;
  occurredAt: string;
  leadId?: string | null;
  email?: string | null;
};

export function verifyHmacSha256Hex(rawBody: string, header: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = header.trim().replace(/^sha256=/i, "");
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyStripeSignature(rawBody: string, header: string, secret: string, now = Date.now()): boolean {
  const items = Object.fromEntries(
    header.split(",").map((part) => {
      const [k, ...rest] = part.split("=");
      return [k?.trim() ?? "", rest.join("=").trim()];
    })
  );
  const timestamp = items.t;
  const v1 = items.v1;
  if (!timestamp || !v1) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function matchLead(
  db: GhlDb,
  orgId: string,
  args: { leadId?: string | null; email?: string | null }
): Promise<string | null> {
  if (args.leadId) {
    const { data } = await db
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("id", args.leadId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  const email = args.email?.trim().toLowerCase();
  if (!email) return null;
  const { data } = await db
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", email)
    .order("opted_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function ingestProcessorEvent(db: GhlDb, event: ProcessorIngest): Promise<void> {
  if (!Number.isFinite(event.amountCents) || event.amountCents <= 0) {
    throw new Error("Processor amounts must be a positive cent count.");
  }
  const leadId = await matchLead(db, event.orgId, { leadId: event.leadId, email: event.email });
  const { error: procError } = await db.from("processor_events").upsert(
    {
      org_id: event.orgId,
      processor: event.processor,
      kind: event.kind,
      amount_cents: event.amountCents,
      currency: event.currency || "usd",
      processor_ref: event.processorRef,
      lead_id: leadId,
      occurred_at: event.occurredAt,
    },
    { onConflict: "org_id,processor,processor_ref,kind" }
  );
  if (procError) throw new Error(procError.message);

  if (event.kind === "failed") return;

  const { data: existing } = await db
    .from("revenue_log")
    .select("id")
    .eq("org_id", event.orgId)
    .eq("processor", event.processor)
    .eq("processor_ref", event.processorRef)
    .eq("kind", event.kind)
    .maybeSingle();
  if (existing) return;

  const { error: insertError } = await db.from("revenue_log").insert({
    org_id: event.orgId,
    lead_id: leadId,
    amount_cents: event.amountCents,
    payment_type: "pif",
    processor: event.processor,
    processor_ref: event.processorRef,
    kind: event.kind,
    occurred_at: event.occurredAt,
  });
  if (insertError && !insertError.message.toLowerCase().includes("duplicate")) {
    throw new Error(insertError.message);
  }
}

export async function findOrgByStripeAccount(db: GhlDb, accountId: string): Promise<string | null> {
  const { data } = await db
    .from("source_connections")
    .select("org_id, metadata")
    .eq("kind", "stripe")
    .eq("status", "active");
  const match = (data ?? []).find((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    return meta?.account_id === accountId || meta?.stripe_user_id === accountId;
  });
  return match?.org_id ?? null;
}

export async function findOrgByCommasPublicToken(db: GhlDb, token: string): Promise<string | null> {
  const { data } = await db
    .from("source_connections")
    .select("org_id")
    .eq("kind", "commas")
    .eq("public_token", token)
    .eq("status", "active")
    .maybeSingle();
  return data?.org_id ?? null;
}

export async function findOrgByFormToken(db: GhlDb, token: string): Promise<string | null> {
  const { data } = await db
    .from("source_connections")
    .select("org_id")
    .eq("kind", "form_platform")
    .eq("public_token", token)
    .eq("status", "active")
    .maybeSingle();
  return data?.org_id ?? null;
}
