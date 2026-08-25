import { PageFrame } from "@/components/app/page-frame";
import { NotificationSettingsForm } from "@/app/app/settings/notifications/notifications-form";
import { getAuthContext } from "@/lib/auth/session";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationSettingsPage() {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const [{ data: prefs }, { data: mute }, { data: org }, { data: team }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("event_type, channel, enabled")
      .eq("member_id", ctx.member.id),
    supabase
      .from("notification_mutes")
      .select("muted_until")
      .eq("member_id", ctx.member.id)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("sms_emergencies_enabled")
      .eq("id", ctx.org.id)
      .maybeSingle(),
    supabase
      .from("notification_team_channels")
      .select("slack_webhook_encrypted, teams_webhook_encrypted")
      .eq("org_id", ctx.org.id)
      .maybeSingle(),
  ]);

  return (
    <PageFrame
      title="Notifications"
      description="What reaches you, on which channel, and when it is allowed to interrupt."
    >
      <NotificationSettingsForm
        role={ctx.role}
        isManager={canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)}
        prefs={prefs ?? []}
        mutedUntil={mute?.muted_until ?? null}
        smsEmergenciesEnabled={org?.sms_emergencies_enabled ?? false}
        slackSaved={Boolean(team?.slack_webhook_encrypted)}
        teamsSaved={Boolean(team?.teams_webhook_encrypted)}
      />
    </PageFrame>
  );
}
