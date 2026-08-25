"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/ghl/crypto";
import { USER_PREF_CHANNELS, USER_PREF_EVENTS } from "@/lib/notifications/constants";
import { deliverOne } from "@/lib/notifications/deliver";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { testSendCopy, notificationHref } from "@/lib/notifications/messages";
import { muteUntilValid, preferenceLocked } from "@/lib/notifications/policy";
import { logSettingsActivity } from "@/lib/settings/activity";
import { canWriteAdvancedSettings } from "@/lib/settings/managed";
import { loadOrgManaged } from "@/lib/settings/org";
import { revalidateSettings } from "@/lib/settings/revalidate";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { NotificationChannel, NotificationEventType } from "@/lib/notifications/types";

export async function saveNotificationPreferences(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  const supabase = await createClient();

  for (const eventType of USER_PREF_EVENTS) {
    for (const channel of USER_PREF_CHANNELS) {
      if (preferenceLocked({ role: ctx.role, eventType, channel })) continue;
      const key = `pref:${eventType}:${channel}`;
      const enabled = formData.get(key) === "on";
      const { error } = await supabase.from("notification_preferences").upsert(
        {
          org_id: ctx.org.id,
          member_id: ctx.member.id,
          event_type: eventType,
          channel,
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "member_id,event_type,channel" }
      );
      if (error) return { status: "error", error: "Could not save preferences." };
    }
  }

  revalidatePath("/app/settings/notifications");
  return { status: "saved" };
}

export async function saveNotificationMute(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const clear = formData.get("clear_mute") === "on";
  if (clear) {
    await supabase.from("notification_mutes").delete().eq("member_id", ctx.member.id);
    revalidatePath("/app/settings/notifications");
    return { status: "saved" };
  }
  const raw = String(formData.get("muted_until") ?? "");
  const until = new Date(raw);
  const valid = muteUntilValid(until);
  if (!valid) {
    return { status: "error", error: "Mute must end in the future, and no later than 7 days from now." };
  }
  const { error } = await supabase.from("notification_mutes").upsert(
    {
      org_id: ctx.org.id,
      member_id: ctx.member.id,
      muted_until: valid.toISOString(),
    },
    { onConflict: "member_id" }
  );
  if (error) return { status: "error", error: "Could not save mute." };
  revalidatePath("/app/settings/notifications");
  return { status: "saved" };
}

export async function saveOrgNotificationSettings(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    return { status: "error", error: "You do not have permission to change these settings." };
  }
  const managed = await loadOrgManaged(ctx.org.id);
  if (!canWriteAdvancedSettings(ctx, managed.managed)) {
    return {
      status: "error",
      error: "These settings are managed by your install team. Take over management, or ask them to make the change.",
    };
  }
  const supabase = await createClient();
  const sms = formData.get("sms_emergencies_enabled") === "on";
  const { error } = await supabase
    .from("organizations")
    .update({ sms_emergencies_enabled: sms })
    .eq("id", ctx.org.id);
  if (error) return { status: "error", error: "Could not save SMS setting." };

  const slack = String(formData.get("slack_webhook") ?? "").trim();
  const teams = String(formData.get("teams_webhook") ?? "").trim();
  const clearSlack = formData.get("clear_slack") === "on";
  const clearTeams = formData.get("clear_teams") === "on";

  const patch: {
    org_id: string;
    slack_webhook_encrypted?: string | null;
    teams_webhook_encrypted?: string | null;
    updated_at: string;
  } = { org_id: ctx.org.id, updated_at: new Date().toISOString() };

  try {
    if (clearSlack) patch.slack_webhook_encrypted = null;
    else if (slack) patch.slack_webhook_encrypted = encryptSecret(slack);
    if (clearTeams) patch.teams_webhook_encrypted = null;
    else if (teams) patch.teams_webhook_encrypted = encryptSecret(teams);
  } catch {
    return { status: "error", error: "Could not store the webhook. Encryption key is missing." };
  }

  const { error: teamError } = await supabase.from("notification_team_channels").upsert(patch);
  if (teamError) return { status: "error", error: "Could not save team channels." };

  await logSettingsActivity({
    ctx,
    section: "notifications",
    action: "Updated workspace alert channels",
    to: { sms },
  });

  revalidatePath("/app/settings/notifications");
  revalidateSettings();
  return { status: "saved" };
}

export async function sendTestNotification(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  const channel = String(formData.get("channel") ?? "") as NotificationChannel;
  if (!["push", "email", "sms", "team"].includes(channel)) {
    return { status: "error", error: "Choose a channel." };
  }
  const copy = testSendCopy(channel);
  const db = getSupabaseAdmin();
  const id = await enqueueNotification(db, {
    orgId: ctx.org.id,
    eventType: "test_send" as NotificationEventType,
    channel,
    recipientUserId: channel === "team" ? null : ctx.user.id,
    recipientMemberId: channel === "team" ? null : ctx.member.id,
    subjectIds: [],
    title: copy.title,
    body: copy.body,
    href: notificationHref("/app/settings/notifications"),
    dedupeKey: `test_send:${channel}:${ctx.user.id}:${Date.now()}`,
    isTest: true,
    sendAfter: new Date(),
  });
  if (!id) return { status: "error", error: "Could not queue the test." };
  const outcome = await deliverOne(db, id);
  if (outcome === "sent" || outcome === "skipped") {
    revalidatePath("/app/settings/notifications");
    return { status: "saved" };
  }
  const { data } = await db.from("notifications").select("error_text").eq("id", id).maybeSingle();
  return {
    status: "error",
    error: data?.error_text || "The test did not send. Check this channel's configuration.",
  };
}
