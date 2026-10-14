import type { SupabaseClient } from "@supabase/supabase-js";

import { HelpArticleForm, type HelpArticleRow } from "@/app/(workspace)/app/team/compass/forms";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { createClient } from "@/lib/supabase/server";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Help articles" };

/** The product answers Compass and the Help page use. Product-neutral: no other company is named. */
export default async function HelpArticlesPage() {
  await requirePlatformAdmin();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db.from("help_articles").select("slug, topic, question, body, link_label, link_href, sort, published").order("sort").order("slug");
  const articles = (data ?? []) as HelpArticleRow[];
  return (
    <PageFrame
      title="Help articles"
      description="What Compass says about how Vistrial works, and what the Help page shows. Keep each answer short and about this product only."
      breadcrumbs={[
        { href: "/app/team/compass", label: "Compass" },
        { href: "/app/team/compass/help", label: "Help articles" },
      ]}
    >
      <Panel className="p-6">
        <h2 className={cardTitle}>Add an article</h2>
        <div className="mt-4">
          <HelpArticleForm article={null} />
        </div>
      </Panel>
      {articles.map((article) => (
        <Panel key={article.slug} className="p-6">
          <p className={helperClass}>
            /app/help#{article.slug}
            {article.published ? "" : " · not published"}
          </p>
          <div className="mt-3">
            <HelpArticleForm article={article} />
          </div>
        </Panel>
      ))}
    </PageFrame>
  );
}
