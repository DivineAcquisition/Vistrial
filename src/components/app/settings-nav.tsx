"use client";

import { usePathname } from "next/navigation";

import { useOrg } from "@/components/app/org-provider";
import { NavTabs } from "@/components/ui/tabs";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { SETTINGS_TABS, settingsTabActiveHref } from "@/lib/navigation";

export function SettingsNav() {
  const pathname = usePathname();
  const { role, isPlatformAdmin } = useOrg();
  const manager = canManageOrgSettings(role, isPlatformAdmin);

  return (
    <NavTabs
      label="Settings"
      className="mb-6"
      activeHref={settingsTabActiveHref(pathname)}
      items={SETTINGS_TABS.filter((tab) => manager || !tab.managerOnly).map((tab) => ({
        href: tab.href,
        label: tab.label,
      }))}
    />
  );
}
