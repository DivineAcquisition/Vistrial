import { ActivityList } from "@/app/(workspace)/app/home/sections";
import { PageFrame } from "@/components/app/page-frame";
import { getAuthContext } from "@/lib/auth/session";
import { loadActivity } from "@/lib/home/views";

export const dynamic = "force-dynamic";

export const metadata = { title: "Handled while you were away" };

export default async function HomeActivityPage() {
  const ctx = await getAuthContext();
  const { entries } = await loadActivity(ctx, 200);
  return (
    <PageFrame
      title="Handled while you were away"
      description="Everything Vistrial did on its own or after someone approved it, newest first."
      breadcrumbs={[
        { label: "Home", href: "/app/home" },
        { label: "Full log", href: "/app/home/activity" },
      ]}
    >
      <div className="mx-auto w-full max-w-3xl">
        {entries.length ? (
          <ActivityList entries={entries} timeZone={ctx.org.timezone} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            Nothing yet.
          </p>
        )}
      </div>
    </PageFrame>
  );
}
