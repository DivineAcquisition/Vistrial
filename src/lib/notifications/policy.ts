import type { OrgRole } from "@/types/database";
import type { GhlDb } from "@/lib/ghl/tokens";
import {
  EMERGENCY_EVENTS,
  ESCALATION_LOCKED_EVENTS,
  NOTIFICATION_HOURLY_CAP,
  NOTIFICATION_MUTE_MAX_MS,
  NOTIFICATION_PRESENCE_TTL_MS,
  USER_PREF_CHANNELS,
} from "@/lib/notifications/constants";
import { defaultChannelEnabled } from "@/lib/notifications/defaults";
import type { NotificationChannel, NotificationEventType } from "@/lib/notifications/types";

export function channelAllowedForRole(args: {
  role: OrgRole;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  override: boolean | null;
  isEscalationToAdmin: boolean;
  forceChannel?: boolean;
}): boolean {
  if (args.channel === "da_console") return false;
  if (args.forceChannel) return true;
  if (args.isEscalationToAdmin && ESCALATION_LOCKED_EVENTS.has(args.eventType)) {
    const lockedDefault = defaultChannelEnabled(args.role, args.eventType, args.channel);
    if (lockedDefault) return true;
    return args.override ?? false;
  }
  if (args.override !== null) return args.override;
  return defaultChannelEnabled(args.role, args.eventType, args.channel);
}

/** One interrupt channel. Preference can move the event, not duplicate it. */
export function pickChannel(args: {
  role: OrgRole;
  eventType: NotificationEventType;
  requested: NotificationChannel;
  overrides: Partial<Record<NotificationChannel, boolean | null>>;
  isEscalationToAdmin: boolean;
  forceChannel?: boolean;
  orgSmsEnabled?: boolean;
}): NotificationChannel | null {
  if (args.requested === "team" || args.requested === "da_console") {
    return args.requested;
  }

  const allowed = (channel: NotificationChannel) => {
    if (channel === "sms" && !args.orgSmsEnabled && args.eventType !== "test_send") {
      return false;
    }
    return channelAllowedForRole({
      role: args.role,
      eventType: args.eventType,
      channel,
      override: args.overrides[channel] ?? null,
      isEscalationToAdmin: args.isEscalationToAdmin,
      forceChannel: args.forceChannel && channel === args.requested,
    });
  };

  if (allowed(args.requested)) return args.requested;
  for (const channel of USER_PREF_CHANNELS) {
    if (channel === args.requested) continue;
    if (allowed(channel)) return channel;
  }
  return null;
}

export async function loadPreferenceOverrides(
  db: GhlDb,
  memberId: string,
  eventType: NotificationEventType
): Promise<Partial<Record<NotificationChannel, boolean | null>>> {
  const { data } = await db
    .from("notification_preferences")
    .select("channel, enabled")
    .eq("member_id", memberId)
    .eq("event_type", eventType);
  const overrides: Partial<Record<NotificationChannel, boolean | null>> = {};
  for (const row of data ?? []) {
    overrides[row.channel] = row.enabled;
  }
  return overrides;
}

export async function loadPreferenceOverride(
  db: GhlDb,
  memberId: string,
  eventType: NotificationEventType,
  channel: NotificationChannel
): Promise<boolean | null> {
  const { data } = await db
    .from("notification_preferences")
    .select("enabled")
    .eq("member_id", memberId)
    .eq("event_type", eventType)
    .eq("channel", channel)
    .maybeSingle();
  if (!data) return null;
  return data.enabled;
}

export async function isMuted(db: GhlDb, memberId: string, now = new Date()): Promise<boolean> {
  const { data } = await db
    .from("notification_mutes")
    .select("muted_until")
    .eq("member_id", memberId)
    .maybeSingle();
  if (!data) return false;
  return Date.parse(data.muted_until) > now.getTime();
}

export function muteUntilValid(mutedUntil: Date, now = new Date()): Date | null {
  const ms = mutedUntil.getTime() - now.getTime();
  if (ms <= 0) return null;
  if (ms > NOTIFICATION_MUTE_MAX_MS) {
    return new Date(now.getTime() + NOTIFICATION_MUTE_MAX_MS);
  }
  return mutedUntil;
}

export function muteApplies(args: {
  emergency: boolean;
  isEscalationToAdmin: boolean;
  eventType: NotificationEventType;
}): boolean {
  if (args.emergency) return false;
  if (args.isEscalationToAdmin && ESCALATION_LOCKED_EVENTS.has(args.eventType)) return false;
  return true;
}

export async function hourlyCount(
  db: GhlDb,
  userId: string,
  now = new Date()
): Promise<number> {
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .in("status", ["queued", "sent", "delivered", "opened", "acted"])
    .in("channel", ["push", "email", "sms"])
    .neq("event_type", "hourly_summary")
    .eq("is_test", false)
    .gte("queued_at", since);
  return count ?? 0;
}

export function overHourlyCap(count: number): boolean {
  return count >= NOTIFICATION_HOURLY_CAP;
}

export async function isLookingAt(
  db: GhlDb,
  userId: string,
  orgId: string,
  hrefPath: string,
  now = new Date()
): Promise<boolean> {
  const { data } = await db
    .from("notification_presence")
    .select("path, seen_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return false;
  if (now.getTime() - Date.parse(data.seen_at) > NOTIFICATION_PRESENCE_TTL_MS) return false;
  const path = data.path.split("?")[0] ?? "";
  let target = hrefPath;
  try {
    target = new URL(hrefPath, "https://app.vistrial.io").pathname;
  } catch {
    target = hrefPath.split("?")[0] ?? hrefPath;
  }
  if (target === "/app/queue") return path === "/app/queue" || path.startsWith("/app/queue/");
  return path === target || path.startsWith(`${target}/`);
}

export function skipSelf(actorUserId: string | null | undefined, recipientUserId: string | null): boolean {
  if (!actorUserId || !recipientUserId) return false;
  return actorUserId === recipientUserId;
}

export function isEmergency(eventType: NotificationEventType): boolean {
  return EMERGENCY_EVENTS.has(eventType);
}

export function preferenceLocked(args: {
  role: OrgRole;
  eventType: NotificationEventType;
  channel: NotificationChannel;
}): boolean {
  if (args.role !== "owner" && args.role !== "admin") return false;
  if (!ESCALATION_LOCKED_EVENTS.has(args.eventType)) return false;
  return defaultChannelEnabled(args.role, args.eventType, args.channel);
}
