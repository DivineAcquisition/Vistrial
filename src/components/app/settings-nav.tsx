"use client";

import { usePathname } from "next/navigation";

import { useOrg } from "@/components/app/org-provider";
import { NavTabs } from "@/components/ui/tabs";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { SETTINGS_TABS } from "@/lib/navigation";

function settingsActiveHref(pathname: string): string {
  if (
    pathname.startsWith("/app/settings/advanced") ||
    pathname.startsWith("/app/settings/workspace") ||
    pathname.startsWith("/app/settings/scoring") ||
    pathname.startsWith("/app/settings/members") ||
    pathname.startsWith("/app/settings/organization") ||
    pathname.startsWith("/app/settings/follow-up") ||
    pathname.startsWith("/app/settings/integrations") ||
    pathname.startsWith("/app/settings/data") ||
    pathname.startsWith("/app/settings/business-profile")
  ) {
    return "/app/settings/workspace";
  }
  if (pathname.startsWith("/app/settings/notifications")) return "/app/settings/notifications";
  if (pathname.startsWith("/app/settings/app")) return "/app/settings/app";
  return "/app/settings/profile";
}

export function SettingsNav() {
  const pathname = usePathname();
  const { role, isPlatformAdmin } = useOrg();
  const manager = canManageOrgSettings(role, isPlatformAdmin);

  return (
    <NavTabs
      label="Settings"
      className="mb-8"
      activeHref={settingsActiveHref(pathname)}
      items={SETTINGS_TABS.filter((tab) => manager || !tab.managerOnly).map((tab) => ({
        href: tab.href,
        label: tab.label,
      }))}
    />
  );
}
