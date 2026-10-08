import { ConfigSections } from "@/components/config/config-sections";
import { HistoryView } from "@/components/config/history-view";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requireStaff } from "@/lib/auth/gates";
import { loadHistory, loadPlatformScreen } from "@/lib/config/screens";
import { createClient } from "@/lib/supabase/server";
import { bodyText } from "@/lib/ui";

export const metadata = { title: "Platform default" };

/**
 * The bottom level, under every template. Only a Platform Admin changes it.
 * A change to a locked rule is a push: it needs a reason, applies to every
 * workspace at once, and each workspace gets a record of it.
 */
export default async function PlatformDefaultPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireStaff();
  const query = await searchParams;
  const supabase = await createClient();
  const screen = await loadPlatformScreen(supabase);
  if (!screen) return null;
  const history = await loadHistory(supabase, screen.layer.id);

  return (
    <PageFrame
      title="Platform default"
      description={`Version ${screen.layer.version}. Every template and workspace starts here.`}
      breadcrumbs={[
        { label: "Templates", href: "/app/team/templates" },
        { label: "Platform default", href: "/app/team/templates/platform" },
      ]}
    >
      <div className="flex max-w-4xl flex-col gap-6">
        <Panel className="p-5 sm:p-6">
          <p className={bodyText}>
            {ctx.isPlatformAdmin
              ? "Changes to unlocked settings reach live workspaces only after each accepts the review notice. Locked rules apply everywhere straight away, so they need a reason."
              : "Only a Platform Admin can change the platform default."}
          </p>
        </Panel>
        <ConfigSections level="platform" layer={screen.layer} effective={screen.effective} canEdit={ctx.isPlatformAdmin} canLock={ctx.isPlatformAdmin} />
        <HistoryView
          entries={history}
          layerId={screen.layer.id}
          basePath="/app/team/templates/platform"
          compare={{ a: Number(query.a) || undefined, b: Number(query.b) || undefined }}
          canRollback={ctx.isPlatformAdmin}
          timeZone={ctx.org.timezone}
        />
      </div>
    </PageFrame>
  );
}
