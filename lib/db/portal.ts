import "server-only";

import type { Day } from "@/lib/billing/cycle";
import { combinedCost, lastCompleteWeek, type CostBreakdown } from "@/lib/portal/cpa";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  Appointment,
  AppointmentDefinition,
  Charge,
  Client,
  ClientNotification,
  ClientUser,
  ShareLink,
  ShareLinkView,
} from "@/types/database";

export async function listClientUsers(clientId: string): Promise<ClientUser[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("client_users")
    .select("*")
    .eq("client_id", clientId)
    .order("invited_at", { ascending: false })
    .returns<ClientUser[]>();

  if (error) throw new Error(`Failed to list portal users: ${error.message}`);
  return data ?? [];
}

export async function getClientUser(id: string): Promise<ClientUser | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("client_users")
    .select("*")
    .eq("id", id)
    .returns<ClientUser[]>()
    .maybeSingle();

  if (error) throw new Error(`Failed to load portal user: ${error.message}`);
  return data ?? null;
}

export async function getClientUserByInviteHash(
  hash: string
): Promise<ClientUser | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("client_users")
    .select("*")
    .eq("invitation_token_hash", hash)
    .eq("status", "invited")
    .returns<ClientUser[]>()
    .maybeSingle();

  if (error) throw new Error(`Failed to load invitation: ${error.message}`);
  return data ?? null;
}

export async function listShareLinks(clientId: string): Promise<
  (ShareLink & { views: ShareLinkView[] | null })[]
> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("share_links")
    .select("*, views:share_link_views(*)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .returns<(ShareLink & { views: ShareLinkView[] | null })[]>();

  if (error) throw new Error(`Failed to list share links: ${error.message}`);
  return data ?? [];
}

export async function getShareLinkByHash(
  hash: string
): Promise<(ShareLink & { client: Client | null }) | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("share_links")
    .select("*, client:clients(*)")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .returns<(ShareLink & { client: Client | null })[]>()
    .maybeSingle();

  if (error) throw new Error(`Failed to load share link: ${error.message}`);
  return data ?? null;
}

export async function recordShareView(
  linkId: string,
  userAgent: string | null
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("share_link_views").insert({
    link_id: linkId,
    user_agent: userAgent,
  });
  if (error) throw new Error(`Failed to record the share view: ${error.message}`);
}

export type PortalDashboard = {
  client: Client;
  period: { start: Day; end: Day };
  cost: CostBreakdown;
  definition: AppointmentDefinition | null;
  appointments: Appointment[];
  charges: Charge[];
};

/**
 * Everything the portal (and a share link) needs for one client, already scoped.
 * Callers never pass a second client id — the membership or share link is the
 * only source of scope.
 */
export async function loadPortalDashboard(
  clientId: string,
  period: { start: Day; end: Day } = lastCompleteWeek()
): Promise<PortalDashboard> {
  const db = createServiceClient();

  const [
    clientResult,
    spendResult,
    feeResult,
    chargesResult,
    appointmentsResult,
    definitionResult,
  ] = await Promise.all([
    db.from("clients").select("*").eq("id", clientId).returns<Client[]>().maybeSingle(),
    db
      .from("ad_spend")
      .select("spend_date, amount")
      .eq("client_id", clientId)
      .gte("spend_date", period.start)
      .lte("spend_date", period.end)
      .returns<{ spend_date: string; amount: number }[]>(),
    db
      .from("charges")
      .select("period_start, period_end, total, status")
      .eq("client_id", clientId)
      .returns<{ period_start: string; period_end: string; total: number; status: string }[]>(),
    db
      .from("charges")
      .select("*")
      .eq("client_id", clientId)
      .order("period_end", { ascending: false })
      .limit(50)
      .returns<Charge[]>(),
    db
      .from("appointments")
      .select("*")
      .eq("client_id", clientId)
      .in("status", ["confirmed", "disputed", "billed", "rejected"])
      .order("scheduled_for", { ascending: false })
      .limit(100)
      .returns<Appointment[]>(),
    db
      .from("appointment_definitions")
      .select("*")
      .eq("client_id", clientId)
      .order("version", { ascending: false })
      .limit(1)
      .returns<AppointmentDefinition[]>(),
  ]);

  if (clientResult.error) {
    throw new Error(`Failed to load client: ${clientResult.error.message}`);
  }
  if (!clientResult.data) {
    throw new Error("That client no longer exists.");
  }
  if (spendResult.error) throw new Error(spendResult.error.message);
  if (feeResult.error) throw new Error(feeResult.error.message);
  if (chargesResult.error) throw new Error(chargesResult.error.message);
  if (appointmentsResult.error) throw new Error(appointmentsResult.error.message);
  if (definitionResult.error) throw new Error(definitionResult.error.message);

  const appointments = appointmentsResult.data ?? [];
  const confirmed = appointments
    .filter(
      (appointment) =>
        appointment.confirmed_at !== null &&
        ["confirmed", "disputed", "billed"].includes(appointment.status)
    )
    .map((appointment) => ({
      confirmed_on: appointment.confirmed_at!.slice(0, 10),
    }));

  const cost = combinedCost({
    period,
    spend: spendResult.data ?? [],
    charges: feeResult.data ?? [],
    appointments: confirmed,
  });

  return {
    client: clientResult.data,
    period,
    cost,
    definition: (definitionResult.data ?? [])[0] ?? null,
    appointments,
    charges: chargesResult.data ?? [],
  };
}

export async function listClientNotifications(
  clientId: string
): Promise<ClientNotification[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("client_notifications")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<ClientNotification[]>();

  if (error) throw new Error(`Failed to list portal notices: ${error.message}`);
  return data ?? [];
}
