import Link from "next/link";

import { CreatePermissionToggle, StageDefinitionForm, TemplateDefaultsForm } from "@/app/(workspace)/app/team/onboarding/settings-ui";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { staffDb } from "@/lib/staff/db";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onboarding settings" };

type Definition = { key: string; position: number; customer_label: string; staff_label: string; why: string; time_estimate: string };

/**
 * Platform Admin only: what each setup stage is called and how long it takes,
 * the per-template defaults, and who on the Service Team may create workspaces.
 * Every change is logged.
 */
export default async function OnboardingSettingsPage() {
  await requirePlatformAdmin();
  const db = await staffDb();
  const [{ data: defs }, { data: templates }, { data: defaults }, { data: staff }] = await Promise.all([
    db.from("onboarding_stage_definitions").select("key, position, customer_label, staff_label, why, time_estimate").order("position"),
    db.from("config_templates").select("id, name").eq("status", "active").order("name"),
    db.from("onboarding_template_defaults").select("template_id, import_lookback_days, sentry_watch_days"),
    db.from("platform_staff").select("user_id, display_name, role, can_create_workspaces").eq("active", true).eq("role", "service_team").order("display_name"),
  ]);
  const byTemplate = new Map(
    ((defaults ?? []) as Array<{ template_id: string; import_lookback_days: number; sentry_watch_days: number }>).map((row) => [row.template_id, row])
  );

  return (
    <PageFrame
      title="Onboarding settings"
      description="Stage wording and time estimates, per-template defaults, and who may create workspaces."
      secondaryActions={
        <Link href="/app/team/support#onboarding" className="text-sm text-brand-300 underline underline-offset-2">
          Reminders and timings
        </Link>
      }
    >
      <Panel className="p-6">
        <h2 className={cardTitle}>Who may create workspaces</h2>
        <p className={helperClass}>Platform Admins always can. Service Team only with this permission. Every grant and every use is logged.</p>
        <div className="mt-4 space-y-3">
          {((staff ?? []) as Array<{ user_id: string; display_name: string; can_create_workspaces: boolean }>).map((person) => (
            <CreatePermissionToggle key={person.user_id} userId={person.user_id} name={person.display_name} allowed={person.can_create_workspaces} />
          ))}
          {(staff ?? []).length ? null : <p className={helperClass}>No active Service Team members.</p>}
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className={cardTitle}>Template defaults</h2>
        <p className={helperClass}>
          How far back a new workspace&apos;s import looks by default (Owners can choose longer, up to the limit in support settings), and how long Sentry only
          watches before the team switches its alerts on.
        </p>
        <div className="mt-4 space-y-6">
          {((templates ?? []) as Array<{ id: string; name: string }>).map((template) => (
            <TemplateDefaultsForm
              key={template.id}
              templateId={template.id}
              name={template.name}
              lookback={byTemplate.get(template.id)?.import_lookback_days ?? 90}
              watchDays={byTemplate.get(template.id)?.sentry_watch_days ?? 1}
            />
          ))}
        </div>
      </Panel>

      <section aria-labelledby="stage-defs" className="space-y-3">
        <h2 id="stage-defs" className={cardTitle}>
          Stages
        </h2>
        <p className={helperClass}>The order, who does each stage, and what finishes it are fixed. Wording and time estimates are yours to change.</p>
        {((defs ?? []) as Definition[]).map((def) => (
          <Panel key={def.key} className="p-5">
            <h3 className="mb-3 text-sm text-strong">
              {def.position}. {def.staff_label}
            </h3>
            <StageDefinitionForm
              stageKey={def.key}
              customerLabel={def.customer_label}
              staffLabel={def.staff_label}
              why={def.why}
              timeEstimate={def.time_estimate}
            />
          </Panel>
        ))}
      </section>
    </PageFrame>
  );
}
