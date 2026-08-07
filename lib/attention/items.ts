/**
 * Gather every condition the attention view cares about.
 *
 * This module only reads. It does not confirm, charge, dispute, or ingest —
 * those stay in their own modules. Items clear themselves when the underlying
 * rows no longer match the queries below.
 */

import "server-only";

import { today, type Day } from "@/lib/billing/cycle";
import { shortfall } from "@/lib/billing/minimum";
import { collapseRows, isEscalated, sortItems } from "@/lib/attention/rank";
import type {
  AttentionItem,
  AttentionRow,
} from "@/lib/attention/types";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  Appointment,
  Charge,
  ChargeNotification,
  Client,
  InboundEvent,
  Lead,
  Touch,
} from "@/types/database";

export type AttentionQuery = {
  clientId?: string;
  now?: Date | number;
};

function ageMs(since: string, now: number): number {
  return Math.max(0, now - Date.parse(since));
}

function item(
  partial: Omit<AttentionItem, "ageMs" | "escalated"> & { since: string },
  now: number
): AttentionItem {
  const ms = ageMs(partial.since, now);
  return {
    ...partial,
    ageMs: ms,
    escalated: isEscalated(partial.type, ms),
  };
}

function addDays(day: Day, days: number): Day {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * The ordered list, already collapsed where a type has many instances.
 */
export async function listAttention(
  query: AttentionQuery = {}
): Promise<{ items: AttentionItem[]; rows: AttentionRow[]; total: number }> {
  const items = sortItems(await gather(query));
  const filtered = query.clientId
    ? items.filter((entry) => entry.clientId === query.clientId)
    : items;

  return {
    items: filtered,
    rows: collapseRows(filtered),
    total: filtered.length,
  };
}

export async function countAttentionItems(): Promise<number> {
  try {
    return (await gather({})).length;
  } catch {
    // The sidebar must not take the shell down.
    return 0;
  }
}

async function gather(query: AttentionQuery): Promise<AttentionItem[]> {
  const db = createServiceClient();
  const now = typeof query.now === "number" ? query.now : (query.now ?? new Date()).valueOf();
  const on = today(now);
  const items: AttentionItem[] = [];

  let clientsQuery = db.from("clients").select("*").neq("status", "Churned");
  if (query.clientId) clientsQuery = clientsQuery.eq("id", query.clientId);

  const { data: clients, error: clientsError } = await clientsQuery.returns<Client[]>();
  if (clientsError) throw new Error(clientsError.message);

  const clientList = clients ?? [];
  const byId = new Map(clientList.map((client) => [client.id, client]));

  /* 1. Failed payments ---------------------------------------------------- */
  {
    let charges = db
      .from("charges")
      .select("*, client:clients(id, name)")
      .eq("status", "failed");
    if (query.clientId) charges = charges.eq("client_id", query.clientId);

    const { data, error } = await charges.returns<
      (Charge & { client: { id: string; name: string } | null })[]
    >();
    if (error) throw new Error(error.message);

    for (const charge of data ?? []) {
      const name =
        charge.client?.name ?? byId.get(charge.client_id)?.name ?? "Unknown client";
      const since = charge.last_attempt_at ?? charge.updated_at ?? charge.created_at;

      items.push(
        item(
          {
            id: `failed-${charge.id}`,
            type: "failed_payment",
            clientId: charge.client_id,
            clientName: name,
            since,
            summary: `${formatMoney(charge.total)} · attempt ${charge.attempts}`,
            detail: [
              charge.failure_reason ?? "The processor gave no reason.",
              charge.next_attempt_at
                ? `Next retry ${formatWhen(charge.next_attempt_at)}.`
                : "No further automatic retry is scheduled.",
            ].join(" "),
            valueAtRisk: Number(charge.total),
            actions: [
              { kind: "retry_payment", chargeId: charge.id },
              { kind: "link", href: `/clients/${charge.client_id}`, label: "Open client" },
            ],
          },
          now
        )
      );
    }
  }

  /* 2. Charges held on failed notification -------------------------------- */
  {
    let charges = db
      .from("charges")
      .select("*, notifications:charge_notifications(kind, status, error, created_at, updated_at)")
      .eq("status", "draft");
    if (query.clientId) charges = charges.eq("client_id", query.clientId);

    const { data, error } = await charges.returns<
      (Charge & {
        notifications:
          | (Pick<
              ChargeNotification,
              "kind" | "status" | "error" | "created_at" | "updated_at"
            >)[]
          | null;
      })[]
    >();
    if (error) throw new Error(error.message);

    for (const charge of data ?? []) {
      const notice = (charge.notifications ?? []).find(
        (row) => row.kind === "pre_charge" && row.status === "failed"
      );
      if (!notice) continue;

      const client = byId.get(charge.client_id);
      const name = client?.name ?? "Unknown client";
      const since = notice.updated_at ?? notice.created_at ?? charge.created_at;

      items.push(
        item(
          {
            id: `held-${charge.id}`,
            type: "held_notification",
            clientId: charge.client_id,
            clientName: name,
            since,
            summary: `${formatMoney(charge.total)} never reached the client`,
            detail:
              notice.error ??
              "Delivery failed. The charge is holding and will not process.",
            valueAtRisk: Number(charge.total),
            actions: [
              { kind: "resend_notice", chargeId: charge.id },
              { kind: "link", href: `/billing?charge=${charge.id}`, label: "Open charge" },
            ],
          },
          now
        )
      );
    }
  }

  /* 3. Open disputes ------------------------------------------------------ */
  {
    let appointments = db
      .from("appointments")
      .select(
        "id, client_id, status, disputed_at, dispute_reason, scheduled_for, updated_at, created_at"
      )
      .eq("status", "disputed");
    if (query.clientId) appointments = appointments.eq("client_id", query.clientId);

    const { data, error } = await appointments.returns<
      Pick<
        Appointment,
        | "id"
        | "client_id"
        | "status"
        | "disputed_at"
        | "dispute_reason"
        | "scheduled_for"
        | "updated_at"
        | "created_at"
      >[]
    >();
    if (error) throw new Error(error.message);

    for (const appointment of data ?? []) {
      const client = byId.get(appointment.client_id);
      const name = client?.name ?? "Unknown client";
      const since =
        appointment.disputed_at ?? appointment.updated_at ?? appointment.created_at;

      items.push(
        item(
          {
            id: `dispute-${appointment.id}`,
            type: "open_dispute",
            clientId: appointment.client_id,
            clientName: name,
            since,
            summary: `Scheduled ${formatWhen(appointment.scheduled_for)}`,
            detail: appointment.dispute_reason ?? "No reason recorded.",
            valueAtRisk: client ? Number(client.rate_per_appointment) : 0,
            actions: [
              { kind: "uphold_dispute", appointmentId: appointment.id },
              { kind: "resolve_dispute", appointmentId: appointment.id },
              {
                kind: "link",
                href: `/appointments?appointment=${appointment.id}`,
                label: "Open",
              },
            ],
          },
          now
        )
      );
    }
  }

  /* 4. Pending confirmations (one aggregate row) -------------------------- */
  {
    let pending = db
      .from("appointments")
      .select("id, client_id, created_at")
      .eq("status", "pending");
    if (query.clientId) pending = pending.eq("client_id", query.clientId);

    const { data, error } = await pending.returns<
      Pick<Appointment, "id" | "client_id" | "created_at">[]
    >();
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    if (rows.length > 0) {
      const oldest = rows.reduce((a, b) =>
        Date.parse(a.created_at) <= Date.parse(b.created_at) ? a : b
      );
      const client =
        query.clientId && byId.get(query.clientId)
          ? byId.get(query.clientId)!
          : null;

      items.push(
        item(
          {
            id: query.clientId ? `pending-${query.clientId}` : "pending-all",
            type: "pending_confirmation",
            clientId: client?.id ?? null,
            clientName: client?.name ?? "All clients",
            since: oldest.created_at,
            summary: `${rows.length} awaiting confirmation`,
            detail: `Oldest has been waiting since ${formatWhen(oldest.created_at)}.`,
            valueAtRisk: 0,
            actions: [{ kind: "link", href: "/queue", label: "Open queue" }],
          },
          now
        )
      );
    }
  }

  /* 5. Leads awaiting a human touch (one aggregate row) ------------------- */
  {
    let leads = db
      .from("leads")
      .select("id, client_id, arrived_at, touches(touch_type, is_first_of_type)")
      .order("arrived_at", { ascending: true })
      .limit(500);
    if (query.clientId) leads = leads.eq("client_id", query.clientId);

    const { data, error } = await leads.returns<
      (Pick<Lead, "id" | "client_id" | "arrived_at"> & {
        touches: Pick<Touch, "touch_type" | "is_first_of_type">[] | null;
      })[]
    >();
    if (error) throw new Error(error.message);

    const awaiting = (data ?? []).filter(
      (lead) =>
        !(lead.touches ?? []).some(
          (touch) => touch.touch_type === "human" && touch.is_first_of_type
        )
    );

    if (awaiting.length > 0) {
      const oldest = awaiting[0];
      const client =
        query.clientId && byId.get(query.clientId)
          ? byId.get(query.clientId)!
          : null;

      items.push(
        item(
          {
            id: query.clientId ? `human-${query.clientId}` : "human-all",
            type: "awaiting_human_touch",
            clientId: client?.id ?? null,
            clientName: client?.name ?? "All clients",
            since: oldest.arrived_at,
            summary: `${awaiting.length} lead${awaiting.length === 1 ? "" : "s"} untouched by a person`,
            detail: `Oldest arrived ${formatWhen(oldest.arrived_at)}.`,
            valueAtRisk: 0,
            actions: [
              {
                kind: "link",
                href: client
                  ? `/leads?client=${client.id}&awaitingHuman=1`
                  : "/leads?awaitingHuman=1",
                label: "Open leads",
              },
            ],
          },
          now
        )
      );
    }
  }

  /* 6. Active clients with no payment method ------------------------------ */
  for (const client of clientList) {
    if (client.status !== "Active") continue;
    if (client.stripe_payment_method_id !== null) continue;

    const since = client.activated_at ?? client.created_at;

    items.push(
      item(
        {
          id: `nomethod-${client.id}`,
          type: "no_payment_method",
          clientId: client.id,
          clientName: client.name,
          since,
          summary: "Active with no card on file",
          detail:
            "Appointments are accumulating that cannot be charged until a payment method exists.",
          valueAtRisk: 0,
          actions: [
            { kind: "send_payment_link", clientId: client.id },
            { kind: "link", href: `/clients/${client.id}`, label: "Open client" },
          ],
        },
        now
      )
    );
  }

  /* 7. Payment methods expiring within thirty days ------------------------ */
  {
    const horizon = now + 30 * 24 * 60 * 60 * 1000;

    for (const client of clientList) {
      if (client.stripe_payment_method_id === null) continue;
      if (client.card_exp_month === null || client.card_exp_year === null) continue;

      const expiry = Date.UTC(
        client.card_exp_year,
        client.card_exp_month,
        0,
        23,
        59,
        59
      );
      if (expiry > horizon) continue;

      const windowStart = expiry - 30 * 24 * 60 * 60 * 1000;
      const sinceMs = expiry <= now ? expiry : Math.min(windowStart, now);

      items.push(
        item(
          {
            id: `expiring-${client.id}`,
            type: "expiring_payment_method",
            clientId: client.id,
            clientName: client.name,
            since: new Date(sinceMs).toISOString(),
            summary: `${client.card_brand ?? "Card"} •••• ${client.card_last4 ?? "????"} expires ${String(
              client.card_exp_month
            ).padStart(2, "0")}/${client.card_exp_year}`,
            detail:
              expiry <= now
                ? "Expired. The next cycle will fail unless it is replaced."
                : "Cheap to fix now; a failed cycle if ignored.",
            valueAtRisk: 0,
            actions: [
              { kind: "send_payment_link", clientId: client.id },
              { kind: "link", href: `/clients/${client.id}`, label: "Open client" },
            ],
          },
          now
        )
      );
    }
  }

  /* 8. Below monthly minimum, cycle closing within three days ------------- */
  {
    const monthStart = `${on.slice(0, 7)}-01`;
    const closeBy = addDays(on, 3);

    const candidates = clientList.filter(
      (client) =>
        client.status === "Active" &&
        Number(client.monthly_minimum) > 0 &&
        client.next_cycle_close !== null &&
        client.next_cycle_close >= on &&
        client.next_cycle_close <= closeBy
    );

    if (candidates.length > 0) {
      const { data: appointments, error } = await db
        .from("appointments")
        .select("client_id, rate_applied, confirmed_at, status")
        .in(
          "client_id",
          candidates.map((client) => client.id)
        )
        .in("status", ["confirmed", "billed"])
        .gte("confirmed_at", `${monthStart}T00:00:00Z`)
        .returns<
          Pick<Appointment, "client_id" | "rate_applied" | "confirmed_at" | "status">[]
        >();

      if (error) throw new Error(error.message);

      const billed = new Map<string, number>();
      for (const appointment of appointments ?? []) {
        const rate = Number(appointment.rate_applied ?? 0);
        billed.set(
          appointment.client_id,
          (billed.get(appointment.client_id) ?? 0) + rate
        );
      }

      for (const client of candidates) {
        const running = billed.get(client.id) ?? 0;
        const gap = shortfall(Number(client.monthly_minimum), running);
        if (gap <= 0) continue;

        const windowStart = addDays(client.next_cycle_close!, -3);

        items.push(
          item(
            {
              id: `minimum-${client.id}`,
              type: "below_minimum",
              clientId: client.id,
              clientName: client.name,
              since: `${windowStart}T00:00:00Z`,
              summary: `${formatMoney(gap)} short · closes ${client.next_cycle_close}`,
              detail: `This month's appointments so far come to ${formatMoney(
                running
              )} against a minimum of ${formatMoney(Number(client.monthly_minimum))}. Worth a conversation before the invoice.`,
              valueAtRisk: gap,
              actions: [
                { kind: "link", href: `/clients/${client.id}`, label: "Open client" },
              ],
            },
            now
          )
        );
      }
    }
  }

  /* 9. Unattributed / unknown inbound (one aggregate row) ----------------- */
  {
    let events = db
      .from("inbound_events")
      .select("id, client_id, received_at, status")
      .in("status", ["unattributed", "unknown", "unclassified", "failed"])
      .order("received_at", { ascending: true })
      .limit(500);
    if (query.clientId) events = events.eq("client_id", query.clientId);

    const { data, error } = await events.returns<
      Pick<InboundEvent, "id" | "client_id" | "received_at" | "status">[]
    >();
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    if (rows.length > 0) {
      const oldest = rows[0];
      const client =
        query.clientId && byId.get(query.clientId)
          ? byId.get(query.clientId)!
          : null;

      items.push(
        item(
          {
            id: query.clientId ? `inbound-${query.clientId}` : "inbound-all",
            type: "unresolved_inbound",
            clientId: client?.id ?? null,
            clientName: client?.name ?? "All clients",
            since: oldest.received_at,
            summary: `${rows.length} unresolved event${rows.length === 1 ? "" : "s"}`,
            detail: `Oldest received ${formatWhen(oldest.received_at)}.`,
            valueAtRisk: 0,
            actions: [
              { kind: "link", href: "/settings#inbound-events", label: "Open settings" },
            ],
          },
          now
        )
      );
    }
  }

  /* 10. Cycle should have closed and did not ------------------------------ */
  for (const client of clientList) {
    if (client.status !== "Active") continue;
    if (client.next_cycle_close === null) continue;
    if (client.next_cycle_close > on) continue;
    if (client.stripe_payment_method_id === null) continue;

    items.push(
      item(
        {
          id: `cycle-${client.id}`,
          type: "cycle_skipped",
          clientId: client.id,
          clientName: client.name,
          since: `${client.next_cycle_close}T00:00:00Z`,
          summary: `Cycle was due ${client.next_cycle_close}`,
          detail:
            "The close date has passed and the cycle has not advanced. Run the cycle job or inspect the job log.",
          valueAtRisk: 0,
          actions: [
            { kind: "link", href: "/billing", label: "Open billing" },
            { kind: "link", href: `/clients/${client.id}`, label: "Open client" },
          ],
        },
        now
      )
    );
  }

  /* 11–13. Exclusivity additions (between disputes and pending in priority) */
  await appendExclusivityAttention(items, query, now, byId);

  return items;
}

async function appendExclusivityAttention(
  items: AttentionItem[],
  query: AttentionQuery,
  now: number,
  byId: Map<string, Client>
): Promise<void> {
  const db = createServiceClient();

  try {
    const { listOpenCrossClientMatches } = await import("@/lib/db/territory");
    const matches = await listOpenCrossClientMatches();

    const leadIds = matches.flatMap((match) => [match.lead_a_id, match.lead_b_id]);
    const confirmed = new Set<string>();

    if (leadIds.length > 0) {
      const { data: appointments } = await db
        .from("appointments")
        .select("lead_id")
        .in("lead_id", leadIds)
        .in("status", ["confirmed", "disputed", "billed"])
        .returns<{ lead_id: string }[]>();

      for (const row of appointments ?? []) confirmed.add(row.lead_id);
    }

    for (const match of matches) {
      if (
        query.clientId &&
        match.client_a_id !== query.clientId &&
        match.client_b_id !== query.clientId
      ) {
        continue;
      }

      const both =
        confirmed.has(match.lead_a_id) && confirmed.has(match.lead_b_id);
      const focusId =
        query.clientId === match.client_b_id ? match.client_b_id : match.client_a_id;
      const otherId =
        focusId === match.client_a_id ? match.client_b_id : match.client_a_id;
      const focusName =
        (focusId === match.client_a_id ? match.client_a?.name : match.client_b?.name) ??
        byId.get(focusId)?.name ??
        "Client";
      const otherName =
        (otherId === match.client_a_id ? match.client_a?.name : match.client_b?.name) ??
        "Other client";

      const otherLead =
        focusId === match.client_a_id ? match.lead_b : match.lead_a;

      items.push(
        item(
          {
            id: `${both ? "both" : "xdup"}-${match.id}-${focusId}`,
            type: both ? "cross_client_both_confirmed" : "cross_client_duplicate",
            clientId: focusId,
            clientName: focusName,
            since: match.created_at,
            summary: both
              ? `Both leads confirmed · also at ${otherName}`
              : `Same ${match.match_on} as a lead at ${otherName}`,
            detail: [
              otherLead
                ? `Other lead arrived ${formatWhen(otherLead.arrived_at)}.`
                : null,
              both
                ? "Divine Acquisition is about to bill two clients for the same homeowner. Decide knowingly."
                : "Neither lead is blocked. Acknowledge once you have seen it.",
            ]
              .filter(Boolean)
              .join(" "),
            valueAtRisk: 0,
            actions: [
              { kind: "acknowledge_match", matchId: match.id },
              {
                kind: "link",
                href: `/leads?client=${focusId}`,
                label: "Open leads",
              },
            ],
          },
          now
        )
      );
    }

    // Volume drop near a same-category peer.
    const { listActiveExclusivityPeers } = await import("@/lib/db/territory");
    const { peerNearby, volumeDroppedSharply } = await import(
      "@/lib/territory/volume"
    );

    const peers = await listActiveExclusivityPeers();
    const filteredPeers = query.clientId
      ? peers.filter((peer) => peer.client.id === query.clientId)
      : peers;

    const recentStart = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const priorStart = new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString();

    for (const peer of filteredPeers) {
      if (peer.categoryIds.length === 0 || peer.territories.length === 0) continue;

      const { count: recent } = await db
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("client_id", peer.client.id)
        .gte("created_at", recentStart);

      const { count: priorTotal } = await db
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("client_id", peer.client.id)
        .gte("created_at", priorStart)
        .lt("created_at", recentStart);

      const recentCount = recent ?? 0;
      const priorCount = priorTotal ?? 0;

      if (!volumeDroppedSharply({
        clientId: peer.client.id,
        recent: recentCount,
        prior: priorCount,
      })) {
        continue;
      }

      const rival = peers.find(
        (other) =>
          other.client.id !== peer.client.id &&
          other.categoryIds.some((id) => peer.categoryIds.includes(id)) &&
          peerNearby(peer.territories, other.territories)
      );

      if (!rival) continue;

      items.push(
        item(
          {
            id: `vol-${peer.client.id}`,
            type: "volume_drop",
            clientId: peer.client.id,
            clientName: peer.client.name,
            since: recentStart,
            summary: `${recentCount} appointments in 14d vs ${priorCount} prior · peer ${rival.client.name}`,
            detail:
              "Volume dropped sharply while another active client shares a category and a nearby territory — the symptom of auction competition.",
            valueAtRisk: 0,
            actions: [
              { kind: "link", href: `/clients/${peer.client.id}`, label: "Open client" },
              { kind: "link", href: "/territories", label: "Territory map" },
            ],
          },
          now
        )
      );
    }
  } catch {
    // Exclusivity tables may not be migrated yet; the rest of attention still works.
  }
}

function formatMoney(amount: number): string {
  const absolute = Math.abs(amount);
  const hasCents = Math.round(absolute * 100) % 100 !== 0;
  const body = absolute.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${body}` : `$${body}`;
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}
