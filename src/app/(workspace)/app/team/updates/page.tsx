import { PublishUpdateForm, RemoveUpdateButton } from "@/app/(workspace)/app/team/updates/update-forms";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { formatDateTime } from "@/lib/format";
import { portalDb } from "@/lib/metrics/load";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "What is new" };

type UpdateRow = { id: string; title: string; body: string; area: string | null; published_at: string };

/** Platform Admin writes the short notes that appear on Help. */
export default async function ProductUpdatesPage() {
  await requirePlatformAdmin();
  const db = await portalDb();
  const { data } = await db.from("product_updates").select("id, title, body, area, published_at").order("published_at", { ascending: false }).limit(30);
  const rows = (data ?? []) as UpdateRow[];
  const now = new Date().toISOString();

  return (
    <PageFrame title="What is new" description="Short notes on Help. A future time stays hidden until then.">
      <PublishUpdateForm />
      {rows.length ? (
        <Panel className="p-6">
          <h2 className={cardTitle}>Published</h2>
          <ul className="mt-3 divide-y divide-overlay/[0.06]">
            {rows.map((row) => {
              const scheduled = row.published_at > now;
              return (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-strong">{row.title}</span>
                    <span className={helperClass}>
                      {scheduled ? "Shows " : ""}
                      {formatDateTime(row.published_at)} UTC
                      {row.area ? ` · ${row.area}` : ""}
                    </span>
                    <span className={`mt-1 block whitespace-pre-line ${helperClass}`}>{row.body}</span>
                  </span>
                  <RemoveUpdateButton id={row.id} />
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </PageFrame>
  );
}
