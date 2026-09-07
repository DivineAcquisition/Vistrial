import { PageFrame } from "@/components/app/page-frame";
import { GlowLinkCard } from "@/components/app/glow-link-card";
import { getAuthContext } from "@/lib/auth/session";
import { DA_CONSOLE_LINKS, MORE_NAV, PRIMARY_NAV, navVisibleTo } from "@/lib/navigation";

export default async function MorePage() {
  const { role, isPlatformAdmin } = await getAuthContext();
  const items = MORE_NAV.filter((item) => navVisibleTo(item, role, isPlatformAdmin)).filter(
    (item) => !PRIMARY_NAV.some((primary) => primary.href === item.href && navVisibleTo(primary, role, isPlatformAdmin))
  );

  return (
    <PageFrame
      title="More"
      description="Quieter tools. Forsight, people, and settings stay in the sidebar."
    >
      <ul className="app-stagger grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.href} className="h-full">
            <GlowLinkCard href={item.href} title={item.label} description={item.description} />
          </li>
        ))}
      </ul>

      {isPlatformAdmin ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-silver">Divine Acquisition</h2>
          <ul className="app-stagger grid gap-4 sm:grid-cols-2">
            {DA_CONSOLE_LINKS.map((item) => (
              <li key={item.href} className="h-full">
                <GlowLinkCard href={item.href} title={item.label} description={item.description} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PageFrame>
  );
}
