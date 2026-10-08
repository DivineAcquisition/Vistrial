"use client";

import { usePathname } from "next/navigation";

import { useOrg } from "@/components/app/org-provider";
import { NavTabs } from "@/components/ui/tabs";

const TABS = [
  { href: "/app/team", label: "Workspaces", adminOnly: false },
  { href: "/app/team/templates", label: "Templates", adminOnly: false },
  { href: "/app/team/notices", label: "Review notices", adminOnly: false },
  { href: "/app/team/staff", label: "Staff", adminOnly: true },
  { href: "/app/team/holds", label: "Holding area", adminOnly: true },
  { href: "/app/team/activity", label: "Activity", adminOnly: false },
];

export function TeamNav() {
  const pathname = usePathname();
  const { isPlatformAdmin } = useOrg();
  const items = TABS.filter((tab) => isPlatformAdmin || !tab.adminOnly);
  const active =
    [...items].sort((a, b) => b.href.length - a.href.length).find((tab) => pathname.startsWith(tab.href))?.href ??
    "/app/team";
  return (
    <NavTabs
      label="Vistrial team"
      className="mb-8"
      activeHref={active}
      items={items.map((tab) => ({ href: tab.href, label: tab.label }))}
    />
  );
}
