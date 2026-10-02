"use client";

import { usePathname } from "next/navigation";

import { useOrg } from "@/components/app/org-provider";
import { NavTabs } from "@/components/ui/tabs";
import { settingsTabActiveHref, settingsTabsVisibleTo } from "@/lib/navigation";

export function SettingsNav() {
  const pathname = usePathname();
  const { role, isPlatformAdmin } = useOrg();

  return (
    <NavTabs
      label="Settings"
      className="mb-8"
      activeHref={settingsTabActiveHref(pathname)}
      items={settingsTabsVisibleTo(role, isPlatformAdmin).map((tab) => ({
        href: tab.href,
        label: tab.label,
      }))}
    />
  );
}
