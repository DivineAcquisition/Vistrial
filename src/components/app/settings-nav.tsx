"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOrg } from "@/components/app/org-provider";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { SETTINGS_TABS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SettingsNav() {
  const pathname = usePathname();
  const { role } = useOrg();
  const manager = canManageOrgSettings(role);

  return (
    <nav aria-label="Settings" className="mb-8 flex flex-wrap gap-1 border-b border-white/[0.08] pb-px">
      {SETTINGS_TABS.filter((tab) => manager || !tab.managerOnly).map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              active
                ? "border-brand-500 text-white"
                : "border-transparent text-silver hover:text-white"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
