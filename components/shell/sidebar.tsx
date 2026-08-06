import Link from "next/link";

import Logo from "@/components/brand/logo";
import { NavItem } from "@/components/shell/nav-item";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { APP_NAME, APP_OWNER, NAV_ITEMS } from "@/lib/constants";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <Link
          href="/appointments"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <Logo markOnly className="h-5 w-auto" />
          <span className="text-base font-bold tracking-[0.22em] text-brand-500 uppercase">
            {APP_NAME}
          </span>
        </Link>
      </div>

      <nav className="flex flex-col">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={<Icon className="size-4 shrink-0" />}
          />
        ))}
      </nav>

      <div className="mt-auto border-t border-border px-6 py-5">
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
