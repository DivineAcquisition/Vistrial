import { NoticeCard, type NoticeView } from "@/components/config/workspace-panels";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requireStaff } from "@/lib/auth/gates";
import { noticeTitle } from "@/lib/config/format";
import { createClient } from "@/lib/supabase/server";
import { bodyText, sectionTitle } from "@/lib/ui";

export const metadata = { title: "Review notices" };

/**
 * Template and platform-default updates waiting for each workspace you work
 * on, with exactly what would change for that workspace. Recent locked-rule
 * pushes are listed too, as a record.
 */
export default async function NoticesPage() {
  await requireStaff();
  const supabase = await createClient();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [{ data: waiting }, { data: pushed }, { data: orgs }, { data: templates }] = await Promise.all([
    supabase.from("config_review_notices").select("*").in("status", ["pending", "postponed"]).order("created_at"),
    supabase.from("config_review_notices").select("*").eq("status", "pushed").gte("created_at", since).order("created_at", { ascending: false }),
    supabase.from("organizations").select("id, name"),
    supabase.from("config_templates").select("id, name"),
  ]);
  const orgName = new Map((orgs ?? []).map((org) => [org.id, org.name]));
  const templateName = new Map((templates ?? []).map((template) => [template.id, template.name]));
  const view = (notice: NonNullable<typeof waiting>[number]): NoticeView => ({
    id: notice.id,
    orgName: orgName.get(notice.org_id) ?? "A workspace",
    title: noticeTitle(notice, notice.template_id ? templateName.get(notice.template_id) : null),
    status: notice.status,
    note: notice.note,
    createdAt: notice.created_at,
    postponedUntil: notice.postponed_until,
    changes: (notice.changes ?? []) as NoticeView["changes"],
  });

  return (
    <PageFrame
      title="Review notices"
      description="Nothing in a template or platform-default update reaches a live workspace until it is accepted here or on that workspace's configuration page."
    >
      <div className="flex max-w-4xl flex-col gap-6">
        <Panel className="p-5 sm:p-6">
          <h2 className={sectionTitle}>Waiting for review</h2>
          {waiting?.length ? (
            <div className="mt-3 flex flex-col gap-3">
              {waiting.map((notice) => (
                <NoticeCard key={notice.id} notice={view(notice)} />
              ))}
            </div>
          ) : (
            <p className={bodyText}>Nothing is waiting.</p>
          )}
        </Panel>
        <Panel className="p-5 sm:p-6">
          <h2 className={sectionTitle}>Locked rules pushed in the last 30 days</h2>
          {pushed?.length ? (
            <div className="mt-3 flex flex-col gap-3">
              {pushed.map((notice) => (
                <NoticeCard key={notice.id} notice={view(notice)} />
              ))}
            </div>
          ) : (
            <p className={bodyText}>None.</p>
          )}
        </Panel>
      </div>
    </PageFrame>
  );
}
