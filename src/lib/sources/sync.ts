import "server-only";

import { encryptSecret } from "@/lib/ghl/crypto";
import { ghlRequest } from "@/lib/ghl/client";
import { ghlError, ghlLog } from "@/lib/ghl/log";
import type { GhlDb } from "@/lib/ghl/tokens";
import {
  calendarBlockFromFreeSlot,
  calendarBlockFromGoogleBusy,
  calendarBlockFromGhlEvent,
  type CalendarBlockDraft,
} from "@/lib/sources/calendar-meta";
import { loadSourceSecret, markSourceError, markSourceVerified } from "@/lib/sources/connections";
import { dollarsToCentsUnflattering, microsToCentsUnflattering } from "@/lib/sources/costs";
import {
  commasApiBase,
  googleAdsDeveloperToken,
} from "@/lib/sources/env";
import { listGoogleAdsCustomerId } from "@/lib/sources/oauth";
import { ingestProcessorEvent } from "@/lib/sources/processor";
import type { Enums } from "@/types/database";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function persistCalendarBlocks(
  db: GhlDb,
  orgId: string,
  source: string,
  blocks: CalendarBlockDraft[]
) {
  for (const block of blocks) {
    await db.from("calendar_blocks").upsert(
      {
        org_id: orgId,
        source,
        kind: block.kind,
        starts_at: block.startsAt,
        ends_at: block.endsAt,
        member_id: block.memberId ?? null,
        lead_id: block.leadId ?? null,
        external_id: block.externalId,
      },
      { onConflict: "org_id,source,external_id" }
    );
  }
}

async function leadIdForGhlContact(db: GhlDb, orgId: string, contactId: string | null): Promise<string | null> {
  if (!contactId) return null;
  const { data } = await db
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("ghl_contact_id", contactId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function testSourceConnection(
  db: GhlDb,
  orgId: string,
  kind: Enums<"source_kind">
): Promise<{ ok: true } | { ok: false; error: string }> {
  const conn = await loadSourceSecret(db, orgId, kind);
  if (!conn || conn.status === "inactive") {
    return { ok: false, error: "This source is not connected." };
  }
  try {
    if (kind === "meta_ads") {
      if (!conn.secret) return { ok: false, error: "No access token stored." };
      const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(conn.secret)}`);
      if (!res.ok) throw new Error(`Meta returned ${res.status}.`);
    } else if (kind === "google_ads") {
      if (!conn.secret) return { ok: false, error: "No access token stored." };
      const token = await googleAccessToken(db, orgId, "google_ads", conn);
      const customerId = await listGoogleAdsCustomerId(token);
      if (!customerId && !asString(conn.metadata.customer_id)) {
        throw new Error("Read-only access works, but no Google Ads customer id was listed.");
      }
    } else if (kind === "stripe") {
      if (!conn.secret) return { ok: false, error: "No access token stored." };
      const res = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${conn.secret}` },
      });
      if (!res.ok) throw new Error(`Stripe returned ${res.status}.`);
    } else if (kind === "commas") {
      if (!conn.secret) return { ok: false, error: "No API key stored." };
      const res = await fetch(`${commasApiBase()}/v1/checkout-sessions?limit=1`, {
        headers: { Authorization: `Bearer ${conn.secret}`, Accept: "application/json" },
      });
      if (res.status === 401 || res.status === 403) throw new Error("Commas rejected the key.");
      if (!res.ok && res.status !== 404) throw new Error(`Commas returned ${res.status}.`);
    } else if (kind === "calendar") {
      if (conn.provider === "ghl") {
        const { data: ghl } = await db
          .from("ghl_connections")
          .select("location_id, status")
          .eq("org_id", orgId)
          .maybeSingle();
        if (ghl?.status !== "active" || !ghl.location_id) {
          throw new Error("GoHighLevel is not connected.");
        }
        const ping = await ghlRequest(db, orgId, `/calendars/?locationId=${encodeURIComponent(ghl.location_id)}`);
        if (!ping.ok) throw new Error("Could not read calendars from GoHighLevel.");
      } else if (conn.secret) {
        const token = await googleAccessToken(db, orgId, "calendar", conn);
        const res = await fetch(
          "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1&fields=items(id)",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) throw new Error(`Google Calendar returned ${res.status}.`);
      } else {
        throw new Error("No calendar credential stored.");
      }
    } else if (kind === "form_platform") {
      if (!conn.publicToken) throw new Error("No webhook token stored.");
    }
    await markSourceVerified(db, orgId, kind);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test failed.";
    await markSourceError(db, orgId, kind, message);
    return { ok: false, error: message };
  }
}

async function refreshGoogleToken(refreshToken: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error("Google token refresh failed.");
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

async function googleAccessToken(
  db: GhlDb,
  orgId: string,
  kind: "google_ads" | "calendar",
  conn: { secret: string | null; refresh: string | null; expiresAt: string | null }
): Promise<string> {
  if (!conn.secret) throw new Error("Google token missing.");
  const expired = conn.expiresAt ? Date.parse(conn.expiresAt) < Date.now() + 60_000 : false;
  if (!expired || !conn.refresh) return conn.secret;
  const env = await import("@/lib/sources/env");
  const clientId = kind === "google_ads" ? env.googleAdsClientId() : env.googleCalendarClientId();
  const clientSecret = kind === "google_ads" ? env.googleAdsClientSecret() : env.googleCalendarClientSecret();
  const refreshed = await refreshGoogleToken(conn.refresh, clientId, clientSecret);
  await db
    .from("source_connections")
    .update({
      secret_encrypted: encryptSecret(refreshed.accessToken),
      token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    })
    .eq("org_id", orgId)
    .eq("kind", kind);
  return refreshed.accessToken;
}

export async function syncOrgSources(db: GhlDb, orgId: string): Promise<{ kinds: string[] }> {
  const synced: string[] = [];
  const { data: rows } = await db
    .from("source_connections")
    .select("kind")
    .eq("org_id", orgId)
    .eq("status", "active");
  for (const row of rows ?? []) {
    try {
      if (row.kind === "meta_ads") await syncMetaAds(db, orgId);
      else if (row.kind === "google_ads") await syncGoogleAds(db, orgId);
      else if (row.kind === "stripe") await syncStripe(db, orgId);
      else if (row.kind === "commas") await syncCommas(db, orgId);
      else if (row.kind === "calendar") await syncCalendar(db, orgId);
      synced.push(row.kind);
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync failed";
      await markSourceError(db, orgId, row.kind, message);
      ghlError("source.sync.failed", { orgId, kind: row.kind, error: message });
    }
  }
  return { kinds: synced };
}

async function syncMetaAds(db: GhlDb, orgId: string) {
  const conn = await loadSourceSecret(db, orgId, "meta_ads");
  if (!conn?.secret) throw new Error("Meta Ads token missing.");
  const accountId = asString(conn.metadata.account_id);
  if (!accountId) throw new Error("No Meta ad account on this connection.");
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const url = new URL(`https://graph.facebook.com/v21.0/act_${accountId.replace(/^act_/, "")}/insights`);
  url.searchParams.set("fields", "campaign_id,campaign_name,spend,actions,date_start");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("level", "campaign");
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("access_token", conn.secret);
  const res = await fetch(url);
  const json = (await res.json()) as { data?: unknown[]; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Meta insights ${res.status}`);
  for (const row of json.data ?? []) {
    const rec = asRecord(row);
    if (!rec) continue;
    const spend = dollarsToCentsUnflattering(asString(rec.spend) ?? 0);
    const actions = Array.isArray(rec.actions) ? rec.actions : [];
    let platformLeads = 0;
    let platformPurchases = 0;
    let modeled = 0;
    for (const action of actions) {
      const item = asRecord(action);
      if (!item) continue;
      const type = (asString(item.action_type) ?? "").toLowerCase();
      const value = Number(item.value ?? 0);
      if (!Number.isFinite(value)) continue;
      if (/estimat|model|incremental_conversion/.test(type)) {
        modeled += value;
        continue;
      }
      if (type === "lead" || type === "leadgen" || type.endsWith(".lead")) platformLeads += value;
      if (type === "purchase" || type === "omni_purchase" || type === "offsite_conversion.fb_pixel_purchase") {
        platformPurchases += value;
      }
    }
    await db.from("ad_spend_days").upsert(
      {
        org_id: orgId,
        platform: "meta",
        spend_date: asString(rec.date_start) ?? since,
        campaign_id: asString(rec.campaign_id),
        campaign_name: asString(rec.campaign_name),
        spend_cents: spend,
        platform_leads: Math.trunc(platformLeads),
        platform_purchases: Math.trunc(platformPurchases),
        modeled_conversions: modeled || null,
      },
      { onConflict: "org_id,platform,spend_date,campaign_id" }
    );
  }
  await markSourceVerified(db, orgId, "meta_ads");
  ghlLog("source.sync.meta", { orgId, rows: json.data?.length ?? 0 });
}

async function syncGoogleAds(db: GhlDb, orgId: string) {
  const conn = await loadSourceSecret(db, orgId, "google_ads");
  if (!conn?.secret) throw new Error("Google Ads token missing.");
  const token = await googleAccessToken(db, orgId, "google_ads", conn);
  let customerId = asString(conn.metadata.customer_id)?.replace(/-/g, "") ?? null;
  if (!customerId) {
    customerId = await listGoogleAdsCustomerId(token);
    if (customerId) {
      await db
        .from("source_connections")
        .update({
          metadata: { ...conn.metadata, customer_id: customerId, scope: "adwords.readonly" },
          account_label: customerId,
          last_error: null,
        })
        .eq("org_id", orgId)
        .eq("kind", "google_ads");
    }
  }
  if (!customerId) {
    throw new Error(
      "Google Ads is connected with the read-only scope, but no customer id was listed. Spend cannot be imported until a customer is returned."
    );
  }
  const developerToken = googleAdsDeveloperToken();
  if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not set.");
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const query = `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.conversions, metrics.all_conversions, segments.date FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`;
  const res = await fetch(`https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Google Ads returned ${res.status}.`);
  const json = (await res.json()) as Array<{ results?: unknown[] }> | { results?: unknown[] };
  const batches = Array.isArray(json) ? json : [json];
  for (const batch of batches) {
    for (const row of batch.results ?? []) {
      const rec = asRecord(row);
      const campaign = asRecord(rec?.campaign);
      const metrics = asRecord(rec?.metrics);
      const segments = asRecord(rec?.segments);
      if (!campaign || !metrics || !segments) continue;
      const conversions = Number(metrics.conversions ?? 0);
      const allConversions = Number(metrics.all_conversions ?? 0);
      const modeled = Number.isFinite(allConversions) && Number.isFinite(conversions) ? Math.max(allConversions - conversions, 0) : 0;
      await db.from("ad_spend_days").upsert(
        {
          org_id: orgId,
          platform: "google",
          spend_date: asString(segments.date) ?? since,
          campaign_id: String(campaign.id ?? ""),
          campaign_name: asString(campaign.name),
          spend_cents: microsToCentsUnflattering(Number(metrics.cost_micros ?? 0)),
          platform_leads: null,
          platform_purchases: Number.isFinite(conversions) ? Math.trunc(conversions) : null,
          modeled_conversions: modeled || null,
        },
        { onConflict: "org_id,platform,spend_date,campaign_id" }
      );
    }
  }
  await markSourceVerified(db, orgId, "google_ads");
}

async function syncStripe(db: GhlDb, orgId: string) {
  const conn = await loadSourceSecret(db, orgId, "stripe");
  if (!conn?.secret) throw new Error("Stripe token missing.");
  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const charges = await stripeGet(conn.secret, `/v1/charges?limit=100&created[gte]=${since}`);
  const list = Array.isArray(asRecord(charges)?.data) ? (asRecord(charges)?.data as unknown[]) : [];
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const amount = Number(rec.amount ?? 0);
    const refunded = rec.refunded === true || Number(rec.amount_refunded ?? 0) > 0;
    const disputed = rec.disputed === true;
    const failed = rec.status === "failed";
    const id = asString(rec.id);
    if (!id || !Number.isFinite(amount) || amount <= 0) continue;
    const occurred = new Date(Number(rec.created ?? 0) * 1000).toISOString();
    const email = asString(asRecord(rec.billing_details)?.email) ?? asString(rec.receipt_email);
    const meta = asRecord(rec.metadata);
    const leadId = asString(meta?.vistrial_lead_id) ?? asString(meta?.lead_id);
    if (failed) {
      await ingestProcessorEvent(db, {
        orgId,
        processor: "stripe",
        kind: "failed",
        amountCents: amount,
        currency: asString(rec.currency) ?? "usd",
        processorRef: id,
        occurredAt: occurred,
        leadId,
        email,
      });
      continue;
    }
    await ingestProcessorEvent(db, {
      orgId,
      processor: "stripe",
      kind: "sale",
      amountCents: amount,
      currency: asString(rec.currency) ?? "usd",
      processorRef: id,
      occurredAt: occurred,
      leadId,
      email,
    });
    if (refunded) {
      const refundedCents = Number(rec.amount_refunded ?? amount);
      await ingestProcessorEvent(db, {
        orgId,
        processor: "stripe",
        kind: "refund",
        amountCents: refundedCents > 0 ? refundedCents : amount,
        currency: asString(rec.currency) ?? "usd",
        processorRef: `${id}:refund`,
        occurredAt: occurred,
        leadId,
        email,
      });
    }
    if (disputed) {
      await ingestProcessorEvent(db, {
        orgId,
        processor: "stripe",
        kind: "chargeback",
        amountCents: amount,
        currency: asString(rec.currency) ?? "usd",
        processorRef: `${id}:dispute`,
        occurredAt: occurred,
        leadId,
        email,
      });
    }
  }
  await markSourceVerified(db, orgId, "stripe");
}

async function stripeGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Stripe ${path} returned ${res.status}.`);
  return res.json();
}

async function syncCommas(db: GhlDb, orgId: string) {
  const conn = await loadSourceSecret(db, orgId, "commas");
  if (!conn?.secret) throw new Error("Commas API key missing.");
  const res = await fetch(`${commasApiBase()}/v1/checkout-sessions?limit=100`, {
    headers: { Authorization: `Bearer ${conn.secret}`, Accept: "application/json" },
  });
  if (res.status === 404) {
    await markSourceVerified(db, orgId, "commas");
    return;
  }
  if (!res.ok) throw new Error(`Commas returned ${res.status}.`);
  const json = (await res.json()) as { data?: unknown[] } | unknown[];
  const list = Array.isArray(json) ? json : json.data ?? [];
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const id = asString(rec.id) ?? asString(rec.ref);
    const amount = Number(rec.amount_cents ?? rec.amountCents ?? 0);
    const kindRaw = (asString(rec.kind) ?? asString(rec.status) ?? "sale").toLowerCase();
    if (!id || amount <= 0) continue;
    const kind: Enums<"revenue_kind"> =
      kindRaw.includes("refund")
        ? "refund"
        : kindRaw.includes("chargeback") || kindRaw.includes("dispute")
          ? "chargeback"
          : kindRaw.includes("fail")
            ? "failed"
            : "sale";
    await ingestProcessorEvent(db, {
      orgId,
      processor: "commas",
      kind,
      amountCents: amount,
      currency: asString(rec.currency) ?? "usd",
      processorRef: id,
      occurredAt: asString(rec.occurred_at) ?? asString(rec.created_at) ?? new Date().toISOString(),
      leadId: asString(rec.lead_id),
      email: asString(rec.email),
    });
  }
  await markSourceVerified(db, orgId, "commas");
}

async function syncCalendar(db: GhlDb, orgId: string) {
  const conn = await loadSourceSecret(db, orgId, "calendar");
  if (!conn) throw new Error("Calendar is not connected.");
  const from = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const to = Date.now() + 14 * 24 * 60 * 60 * 1000;
  if (conn.provider === "ghl") {
    const { data: ghl } = await db
      .from("ghl_connections")
      .select("location_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!ghl?.location_id) throw new Error("GoHighLevel location missing.");
    const calendars = await ghlRequest<{ calendars?: Array<{ id?: string }> }>(
      db,
      orgId,
      `/calendars/?locationId=${encodeURIComponent(ghl.location_id)}`
    );
    const ids = (calendars.json?.calendars ?? []).map((row) => row.id).filter((id): id is string => Boolean(id));
    const blocks: CalendarBlockDraft[] = [];
    for (const calendarId of ids) {
      const events = await ghlRequest<{ events?: unknown[] }>(
        db,
        orgId,
        `/calendars/events?locationId=${encodeURIComponent(ghl.location_id)}&calendarId=${encodeURIComponent(calendarId)}&startTime=${from}&endTime=${to}`
      );
      for (const event of events.json?.events ?? []) {
        const rec = asRecord(event);
        const contactId = asString(rec?.contactId) ?? asString(rec?.contact_id);
        const leadId = await leadIdForGhlContact(db, orgId, contactId);
        const block = calendarBlockFromGhlEvent(event, leadId);
        if (block) blocks.push(block);
      }
      const slots = await ghlRequest<{ slots?: unknown[] } | Record<string, unknown[]>>(
        db,
        orgId,
        `/calendars/${encodeURIComponent(calendarId)}/free-slots?startDate=${from}&endDate=${to}`
      );
      const slotList = Array.isArray(slots.json)
        ? slots.json
        : Array.isArray((slots.json as { slots?: unknown[] } | null)?.slots)
          ? ((slots.json as { slots?: unknown[] }).slots ?? [])
          : Object.values((slots.json as Record<string, unknown[]>) ?? {}).flat();
      slotList.forEach((slot, index) => {
        const block = calendarBlockFromFreeSlot(slot, calendarId, index);
        if (block) blocks.push(block);
      });
    }
    await persistCalendarBlocks(db, orgId, "ghl", blocks);
  } else if (conn.secret) {
    const token = await googleAccessToken(db, orgId, "calendar", conn);
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: new Date(from).toISOString(),
        timeMax: new Date(to).toISOString(),
        items: [{ id: "primary" }],
      }),
    });
    if (!res.ok) throw new Error(`Google freeBusy returned ${res.status}.`);
    const json = (await res.json()) as {
      calendars?: Record<string, { busy?: unknown[] }>;
    };
    const blocks: CalendarBlockDraft[] = [];
    const busy = json.calendars?.primary?.busy ?? [];
    busy.forEach((slot, index) => {
      const block = calendarBlockFromGoogleBusy(slot, "primary", index);
      if (block) blocks.push(block);
    });
    await persistCalendarBlocks(db, orgId, "google", blocks);
  }
  await markSourceVerified(db, orgId, "calendar");
}

export async function runSourceSyncJobs(db: GhlDb): Promise<{ processed: number; failed: number }> {
  const { data: orgs } = await db.from("source_connections").select("org_id").eq("status", "active");
  const unique = [...new Set((orgs ?? []).map((row) => row.org_id))];
  let processed = 0;
  let failed = 0;
  for (const orgId of unique) {
    try {
      await syncOrgSources(db, orgId);
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}
