import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadReportingPanel, loadReportingState } from "@/lib/reporting/load";
import type { ReportingRange } from "@/lib/reporting/range";

export async function loadPortalRpc(
  orgId: string,
  fn:
    | "portal_adoption"
    | "portal_ads"
    | "portal_processor"
    | "portal_calendar"
    | "portal_forms"
    | "portal_recorder",
  range: ReportingRange
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, {
    p_org_id: orgId,
    p_from: range.from,
    p_to: range.to,
  });
  if (error) {
    throw new Error(error.message);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Portal panel returned no payload.");
  }
  return data as Record<string, unknown>;
}

export async function loadPortalRpcAdmin(
  orgId: string,
  fn:
    | "portal_adoption"
    | "portal_ads"
    | "portal_processor"
    | "portal_calendar"
    | "portal_forms"
    | "portal_recorder",
  range: ReportingRange
): Promise<Record<string, unknown>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc(fn, {
    p_org_id: orgId,
    p_from: range.from,
    p_to: range.to,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? {}) as Record<string, unknown>;
}

export async function loadPortalSchedule(orgId: string): Promise<{
  cadence: "weekly" | "monthly";
  enabled: boolean;
  lastSentAt: string | null;
  nextSendAt: string | null;
  lastError: string | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("portal_schedules")
    .select("cadence, enabled, last_sent_at, next_send_at, last_error")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) {
    const next = nextSendAtFor("monthly");
    await supabase.from("portal_schedules").upsert(
      { org_id: orgId, cadence: "monthly", enabled: true, next_send_at: next },
      { onConflict: "org_id", ignoreDuplicates: true }
    );
    return {
      cadence: "monthly",
      enabled: true,
      lastSentAt: null,
      nextSendAt: next,
      lastError: null,
    };
  }
  return {
    cadence: data.cadence === "weekly" ? "weekly" : "monthly",
    enabled: data.enabled,
    lastSentAt: data.last_sent_at,
    nextSendAt: data.next_send_at,
    lastError: data.last_error,
  };
}

export function nextSendAtFor(cadence: "weekly" | "monthly", from = new Date()): string {
  if (cadence === "weekly") {
    const next = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    return next.toISOString();
  }
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + 1;
  const firstNext = new Date(Date.UTC(year, month, 1, 8, 0, 0));
  return firstNext.toISOString();
}

export function scheduledEmailRange(
  cadence: "weekly" | "monthly",
  now = new Date()
): ReportingRange {
  if (cadence === "weekly") {
    const to = now.toISOString();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return {
      key: "custom",
      from,
      to,
      fromDate: from.slice(0, 10),
      toDate: to.slice(0, 10),
    };
  }
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const fromDate = new Date(Date.UTC(year, month - 1, 1));
  const toDate = new Date(Date.UTC(year, month, 1));
  const from = fromDate.toISOString();
  const to = toDate.toISOString();
  return {
    key: "custom",
    from,
    to,
    fromDate: from.slice(0, 10),
    toDate: new Date(toDate.getTime() - 1).toISOString().slice(0, 10),
  };
}

export { loadReportingPanel, loadReportingState };

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
