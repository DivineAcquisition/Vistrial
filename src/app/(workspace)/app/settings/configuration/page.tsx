import Link from "next/link";

import { ConfigSections } from "@/components/config/config-sections";
import { NoticeCard, ReadinessPanel, TemplateSwitchPanel, type NoticeView } from "@/components/config/workspace-panels";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requireStaff } from "@/lib/auth/gates";
import { noticeTitle } from "@/lib/config/format";
import { advancedSettingsBreadcrumbs } from "@/lib/navigation";
import { loadWorkspaceScreen } from "@/lib/config/screens";
import type { TestRunStep } from "@/lib/config/test-run";
import { createClient } from "@/lib/supabase/server";
import { bodyText, btnSecondary, btnSizeSm, captionText, sectionTitle } from "@/lib/ui";

export const metadata = { title: "Configuration" };

/**
 * Everything this workspace runs on: which template, what it overrides, what
 * is locked, what is missing before go-live, and updates waiting for review.
 * Vistrial staff only; owners see their few settings on the Workspace page.
 */
export default async function ConfigurationPage() {
  const ctx = await requireStaff();
  const supabase = await createClient();
  const screen = await loadWorkspaceScreen(supabase, ctx.org.id);

  if (!screen) {
    return (
      <PageFrame title="Configuration" description="This workspace has no configuration yet.">
        <Panel className="p-6">
          <p className={bodyText}>The configuration is created with the workspace. If this persists, ask a Platform Admin.</p>
        </Panel>
      </PageFrame>
    );
  }

  const { effective, layer, template, notices, readiness, stops, org, pin } = screen;
  const overridden = Object.keys(layer.values).length;
  const noticeViews: NoticeView[] = notices.map((notice) => ({
    id: notice.id,
    title: noticeTitle(notice, template?.name),
    status: notice.status,
    note: notice.note,
    createdAt: notice.created_at,
    postponedUntil: notice.postponed_until,
    changes: (notice.changes ?? []) as NoticeView["changes"],
  }));

  return (
    <PageFrame
      title="Configuration"
      breadcrumbs={advancedSettingsBreadcrumbs("Configuration", "/app/settings/configuration")}
      description={`${template ? `On the ${template.name} template` : "No template"} · ${overridden} setting${overridden === 1 ? "" : "s"} set for this workspace · version ${effective.version}`}
      actions={
        <Link href="/app/settings/configuration/history" className={`${btnSecondary} ${btnSizeSm}`}>
          History and compare
        </Link>
      }
    >
      <div className="flex max-w-4xl flex-col gap-6">
        {stops.length ? (
          <Panel className="border-flag-critical/40 p-5 sm:p-6">
            <h2 className={sectionTitle}>Stopped until fixed</h2>
            {stops.map((stop) => (
              <p key={stop.id} className={bodyText}>
                {stop.reason}{" "}
                <span className={captionText}>
                  ({stop.occurrences} time{stop.occurrences === 1 ? "" : "s"}, last {new Date(stop.last_stopped_at).toLocaleString("en-US", { timeZone: org.timezone })})
                </span>
              </p>
            ))}
          </Panel>
        ) : null}

        <ReadinessPanel
          orgId={org.id}
          status={org.status}
          version={effective.version}
          issues={effective.issues}
          readiness={
            readiness
              ? {
                  config_version: readiness.config_version,
                  ready: readiness.ready,
                  checked_at: readiness.checked_at,
                  test_run: (readiness.test_run ?? null) as TestRunStep[] | null,
                }
              : null
          }
        />

        {noticeViews.length ? (
          <Panel className="p-5 sm:p-6">
            <h2 className={sectionTitle}>Updates waiting for review</h2>
            <p className={bodyText}>Nothing here applies to this workspace until someone accepts it. Only what would change for this workspace is shown.</p>
            <div className="mt-3 flex flex-col gap-3">
              {noticeViews.map((notice) => (
                <NoticeCard key={notice.id} notice={notice} />
              ))}
            </div>
          </Panel>
        ) : null}

        <TemplateSwitchPanel
          orgId={org.id}
          currentTemplateId={pin?.template_id ?? null}
          templates={screen.templates}
          autoAccept={Boolean(pin?.auto_accept_while_onboarding)}
          onboarding={org.status === "onboarding"}
        />

        <ConfigSections level="workspace" layer={layer} effective={effective} canEdit={org.status !== "closed"} canLock={false} />
      </div>
    </PageFrame>
  );
}
