import Link from "next/link";

import Logo from "@/components/brand/logo";
import { NavItem } from "@/components/shell/nav-item";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { countAttentionItems } from "@/lib/attention/items";
import { requireAdmin } from "@/lib/auth";
import { APP_NAME, APP_OWNER, NAV_ITEMS } from "@/lib/constants";
import { countQueue } from "@/lib/db/appointments";

type Counts = { queue: number; attention: number };

function badge(href: string, counts: Counts) {
  if (href === "/attention" && counts.attention > 0) {
    return { count: counts.attention, tone: "critical" as const };
  }
  if (href === "/queue" && counts.queue > 0) {
    return { count: counts.queue, tone: "warning" as const };
  }
  return null;
}

export async function Sidebar() {
  const admin = await requireAdmin();
  const [queue, attention] = await Promise.all([
    countQueue(),
    countAttentionItems(),
  ]);

  const counts: Counts = { queue, attention };
  const items = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(admin.team.role)
  );

  return (
    <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <Link
          href="/attention"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <Logo markOnly className="h-5 w-auto" />
          <span className="text-base font-bold tracking-[0.22em] text-brand-500 uppercase">
            {APP_NAME}
          </span>
        </Link>
      </div>

      <nav className="flex flex-col">
        {items.map(({ href, label, icon: Icon }) => {
          const marker = badge(href, counts);

          return (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={<Icon className="size-4 shrink-0" />}
              count={marker?.count}
              countTone={marker?.tone}
            />
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border px-6 py-5">
        <Link
          href="/account"
          className="mb-3 block text-xs text-brand-500 hover:text-brand-400"
        >
          {admin.team.full_name ?? admin.email}
        </Link>
        <p className="text-[11px] text-dim">
          {APP_NAME} · by {APP_OWNER}
        </p>
        <div className="mt-2 -ml-2">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
