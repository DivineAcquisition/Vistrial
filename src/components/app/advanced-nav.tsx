"use client";

import { usePathname } from "next/navigation";

import { useOrg } from "@/components/app/org-provider";
import { NavTabs } from "@/components/ui/tabs";
import { isOwnerRole } from "@/lib/settings/managed";
import { ADVANCED_TABS } from "@/lib/navigation";

export function AdvancedNav() {
  const pathname = usePathname();
  const { role, isPlatformAdmin } = useOrg();
  const owner = isOwnerRole(role, isPlatformAdmin);

  return (
    <NavTabs
      label="Advanced settings"
      className="mb-8"
      activeHref={pathname}
      items={ADVANCED_TABS.filter((tab) => owner || !tab.ownerOnly).map((tab) => ({
        href: tab.href,
        label: tab.label,
      }))}
    />
  );
}
