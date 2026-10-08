import { notFound } from "next/navigation";

import { ConfigSections } from "@/components/config/config-sections";
import { HistoryView } from "@/components/config/history-view";
import { TemplateDetailsForm, TemplateStatusControl } from "@/components/config/template-forms";
import { TestRunView } from "@/components/config/test-run-view";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requireStaff } from "@/lib/auth/gates";
import { loadHistory, loadTemplateScreen } from "@/lib/config/screens";
import { defaultSampleLead, runConfigTest } from "@/lib/config/test-run";
import { createClient } from "@/lib/supabase/server";
import { bodyText, sectionTitle } from "@/lib/ui";

export const metadata = { title: "Template" };

const STATUS_WORDS: Record<string, string> = { draft: "Draft", active: "Active", retired: "Retired" };

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireStaff();
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const screen = await loadTemplateScreen(supabase, id);
  if (!screen) notFound();
  const { template, layer, effective, workspaces } = screen;
  const history = await loadHistory(supabase, layer.id);
  // A sample business so the preview reads like a real workspace.
  const preview = runConfigTest(
    { ...effective.values, "identity.business_name": "Sample business", "identity.display_name": "Sample business" },
    defaultSampleLead(new Date())
  );

  return (
    <PageFrame
      title={template.name}
      description={`${STATUS_WORDS[template.status] ?? template.status} · version ${layer.version} · ${workspaces} workspace${workspaces === 1 ? "" : "s"} on it`}
      breadcrumbs={[
        { label: "Templates", href: "/app/team/templates" },
        { label: template.name, href: `/app/team/templates/${template.id}` },
      ]}
    >
      <div className="flex max-w-4xl flex-col gap-6">
        <Panel className="p-5 sm:p-6">
          <h2 className={sectionTitle}>About this template</h2>
          <div className="mt-3">
            <TemplateDetailsForm templateId={template.id} name={template.name} description={template.description} canEdit={ctx.templateAccess} />
          </div>
          {ctx.isPlatformAdmin ? (
            <div className="mt-5">
              <TemplateStatusControl templateId={template.id} status={template.status} />
            </div>
          ) : null}
        </Panel>

        <Panel className="p-5 sm:p-6">
          <h2 className={sectionTitle}>Preview with a sample lead</h2>
          <p className={bodyText}>How a new workspace on this template would treat a lead arriving now. Nothing is sent.</p>
          {effective.issues.length ? (
            <p className="mt-2 text-sm text-flag-critical">
              Not complete yet: {effective.issues.length} setting{effective.issues.length === 1 ? "" : "s"} need attention before it can be activated.
            </p>
          ) : null}
          <div className="mt-3">
            <TestRunView steps={preview} />
          </div>
        </Panel>

        <ConfigSections level="template" layer={layer} effective={effective} canEdit={ctx.templateAccess} canLock={ctx.isPlatformAdmin} />

        <HistoryView
          entries={history}
          layerId={layer.id}
          basePath={`/app/team/templates/${template.id}`}
          compare={{ a: Number(query.a) || undefined, b: Number(query.b) || undefined }}
          canRollback={ctx.templateAccess}
          timeZone={ctx.org.timezone}
        />
      </div>
    </PageFrame>
  );
}
