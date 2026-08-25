import { PageFrame } from "@/components/app/page-frame";
import { NotificationSettingsForm } from "@/app/app/settings/notifications/notifications-form";
import { WorkingHoursForm } from "@/app/app/settings/notifications/working-hours-form";
import { SectionHeader } from "@/components/ui/section-header";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationSettingsPage() {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const [{ data: prefs }, { data: mute }, { data: member }] = await Promise.all([
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
      .from("org_members")
      .select("phone, timezone, working_hours_start, working_hours_end, working_days")
      .eq("id", ctx.member.id)
      .maybeSingle(),
  ]);

  return (
    <PageFrame
      title="Notifications"
      description="What reaches you, on which channel, and when it is allowed to interrupt."
    >
      <div className="space-y-10">
        <section>
          <SectionHeader
            title="Your hours"
            hint="Working hours are evaluated in your timezone. Empty fields inherit the organization."
          />
          <WorkingHoursForm
            phone={member?.phone ?? null}
            timezone={member?.timezone ?? null}
            workingHoursStart={member?.working_hours_start?.slice(0, 5) ?? null}
            workingHoursEnd={member?.working_hours_end?.slice(0, 5) ?? null}
            workingDays={member?.working_days ?? []}
          />
        </section>
        <NotificationSettingsForm
          role={ctx.role}
          prefs={prefs ?? []}
          mutedUntil={mute?.muted_until ?? null}
        />
      </div>
    </PageFrame>
  );
}
