import { PageFrame } from "@/components/app/page-frame";
import { NotificationSettingsForm } from "@/app/(workspace)/app/settings/notifications/notifications-form";
import { getAuthContext } from "@/lib/auth/session";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { Panel } from "@/components/ui/panel";
import { EMERGENCY_EVENTS, ESCALATION_LOCKED_EVENTS, NOTIFICATION_HOURLY_CAP } from "@/lib/notifications/constants";
import { EVENT_LABELS } from "@/lib/notifications/labels";
import type { NotificationEventType } from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/server";
import { cardTitle, helperClass } from "@/lib/ui";

function labels(events: Set<string>): string {
  return [...events].map((event) => EVENT_LABELS[event as NotificationEventType] ?? event).join(", ");
}

/** The rules that decide what gets through, in plain words. */
function HowItWorks({ manager }: { manager: boolean }) {
  return (
    <Panel className="mb-8 space-y-3 p-6">
      <h2 className={cardTitle}>How notifications are limited</h2>
      <ul className={`${helperClass} list-disc space-y-2 pl-5`}>
        <li>
          At most {NOTIFICATION_HOURLY_CAP} reach you in any hour. Past that, the rest are folded into one summary so
          your phone does not keep buzzing.
        </li>
        <li>
          Outside your working hours, anything that can wait is held until your next working hour. Only two alerts come
          through at any time ({labels(EMERGENCY_EVENTS).toLowerCase()}), because leads stop arriving until someone
          fixes them.
        </li>
        <li>
          Muting pauses everything except those two for the time you choose.
        </li>
        {manager ? (
          <li>
            As an owner you cannot turn off {labels(ESCALATION_LOCKED_EVENTS).toLowerCase()} when they are escalated
            to you, because nobody else would hear about them.
          </li>
        ) : null}
        <li>Emails about your account, like replies from your Vistrial team, follow the choice on your profile.</li>
        <li>Notices about security, billing, and required alerts cannot be turned off.</li>
      </ul>
    </Panel>
  );
}

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
      <HowItWorks manager={canManageOrgSettings(ctx.role, ctx.isStaff) || ctx.role === "owner"} />
      <NotificationSettingsForm
        role={ctx.role}
        isManager={canManageOrgSettings(ctx.role, ctx.isStaff)}
        prefs={prefs ?? []}
        mutedUntil={mute?.muted_until ?? null}
        smsEmergenciesEnabled={org?.sms_emergencies_enabled ?? false}
        slackSaved={Boolean(team?.slack_webhook_encrypted)}
        teamsSaved={Boolean(team?.teams_webhook_encrypted)}
      />
    </PageFrame>
  );
}
