"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Logo from "@/components/brand/logo";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { UserMenu } from "@/components/app/user-menu";
import { useOrg } from "@/components/app/org-provider";
import { canManageMembers } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Inbox", exact: true },
  { href: "/app", label: "Case Files", exact: true, disabled: true },
  { href: "/app", label: "Calls", exact: true, disabled: true },
  { href: "/app", label: "Reporting", exact: true, disabled: true },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { role } = useOrg();
  const showSettings = canManageMembers(role);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.08] bg-ink-900">
      <div className="px-4 py-5">
        <Logo className="h-6 w-auto" />
      </div>
      <div className="px-2 pb-4">
        <OrgSwitcher />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV.map((item) => {
          const active = item.exact && pathname === "/app" && item.label === "Inbox";
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "rounded-xl px-3 py-2 text-sm",
                active ? "bg-brand-950 text-brand-300" : "text-silver hover:bg-white/[0.04] hover:text-white",
                "disabled" in item && item.disabled && "opacity-60"
              )}
            >
              {item.label}
            </Link>
          );
        })}
        {showSettings ? (
          <Link
            href="/app/settings/members"
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              pathname.startsWith("/app/settings")
                ? "bg-brand-950 text-brand-300"
                : "text-silver hover:bg-white/[0.04] hover:text-white"
            )}
          >
            Settings
          </Link>
        ) : null}
      </nav>
      <div className="border-t border-white/[0.08] p-2">
        <UserMenu />
      </div>
    </aside>
  );
}
