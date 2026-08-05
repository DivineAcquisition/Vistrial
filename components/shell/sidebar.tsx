import Link from "next/link";

import Logo from "@/components/brand/logo";
import { NavItem } from "@/components/shell/nav-item";
import { APP_NAME, APP_OWNER, NAV_ITEMS } from "@/lib/constants";
import { countUnresolvedEvents } from "@/lib/db/inbound-events";

export async function Sidebar() {
  // Inbound events nobody could place are worth seeing without opening settings.
  const unresolved = await countUnresolvedEvents();

  return (
    <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-white/[0.06] bg-ink-900/40">
      <div className="flex h-16 items-center border-b border-white/[0.06] px-5">
        <Link
          href="/appointments"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <Logo markOnly className="h-6 w-auto" />
          <span className="text-sm font-semibold tracking-tight text-white">
            {APP_NAME}
            <span className="ml-1.5 font-normal text-neutral-500">Ledger</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={<Icon className="size-4 shrink-0" />}
            count={href === "/settings" && unresolved > 0 ? unresolved : undefined}
            countTone="critical"
          />
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.14em] text-neutral-600 uppercase">
          Internal only
        </p>
        <p className="px-2 text-xs leading-relaxed text-neutral-500">
          {APP_NAME} · by {APP_OWNER}
        </p>
      </div>
    </aside>
  );
}
