import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { getAuthContext } from "@/lib/auth/session";
import { DA_CONSOLE_LINKS, MORE_NAV, PRIMARY_NAV, navVisibleTo } from "@/lib/navigation";
import { helperClass } from "@/lib/ui";

export default async function MorePage() {
  const { role, isPlatformAdmin } = await getAuthContext();
  const items = MORE_NAV.filter((item) => navVisibleTo(item, role, isPlatformAdmin)).filter(
    (item) => !PRIMARY_NAV.some((primary) => primary.href === item.href && navVisibleTo(primary, role, isPlatformAdmin))
  );

  return (
    <PageFrame
      title="More"
      description="Everything that is not who to call, who you are talking to, or whether this is working."
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <Panel className="h-full p-5 transition-colors hover:bg-white/[0.04]">
                <p className="text-sm font-medium text-white">{item.label}</p>
                {item.description ? <p className={`mt-1 ${helperClass}`}>{item.description}</p> : null}
              </Panel>
            </Link>
          </li>
        ))}
      </ul>

      {isPlatformAdmin ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-silver">Divine Acquisition</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {DA_CONSOLE_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <Panel className="h-full p-5 transition-colors hover:bg-white/[0.04]">
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className={`mt-1 ${helperClass}`}>{item.description}</p>
                  </Panel>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PageFrame>
  );
}
