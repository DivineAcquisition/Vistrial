import type { OrgRole } from "@/types/database";

import { canManageOrgSettings } from "@/lib/auth/permissions";

/**
 * Navigation groups. The items and their labels are unchanged; the grouping
 * only gives the sidebar a heading above each band so a new setter can tell
 * the working screens from the reporting and configuration ones.
 *
 * Icons are named rather than imported so this stays a data module that server
 * code can read without pulling an icon library in with it.
 */
export type NavGroupId = "work" | "measure" | "configure";

export const NAV_GROUPS: Array<{ id: NavGroupId; label: string }> = [
  { id: "work", label: "Work" },
  { id: "measure", label: "Measure" },
  { id: "configure", label: "Configure" },
];

export type NavIcon = "queue" | "cases" | "calls" | "reporting" | "settings";

export type NavItem = {
  href: string;
  label: string;
  /** Prefix used for active-state, including nested routes. */
  match: string;
  group: NavGroupId;
  icon: NavIcon;
  roles?: OrgRole[];
  platformAdminOnly?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/app/queue", label: "Queue", match: "/app/queue", group: "work", icon: "queue" },
  { href: "/app/cases", label: "Case Files", match: "/app/cases", group: "work", icon: "cases" },
  { href: "/app/calls", label: "Calls", match: "/app/calls", group: "work", icon: "calls" },
  {
    href: "/app/reporting",
    label: "Reporting",
    match: "/app/reporting",
    group: "measure",
    icon: "reporting",
    roles: ["owner", "admin"],
  },
  {
    href: "/app/ops",
    label: "Operator",
    match: "/app/ops",
    group: "measure",
    icon: "reporting",
    platformAdminOnly: true,
  },
  {
    href: "/app/settings",
    label: "Settings",
    match: "/app/settings",
    group: "configure",
    icon: "settings",
  },
];

export function navVisibleTo(item: NavItem, role: OrgRole, isPlatformAdmin = false): boolean {
  if (item.platformAdminOnly) return isPlatformAdmin;
  if (isPlatformAdmin) return true;
  if (!item.roles) return true;
  return item.roles.includes(role);
}

export function isNavActive(pathname: string, match: string): boolean {
  return pathname === match || pathname.startsWith(`${match}/`);
}

export const SETTINGS_TABS: Array<{
  href: string;
  label: string;
  managerOnly: boolean;
}> = [
  { href: "/app/settings/organization", label: "Organization", managerOnly: true },
  { href: "/app/settings/business-profile", label: "Business profile", managerOnly: true },
  { href: "/app/settings/members", label: "Members", managerOnly: true },
  { href: "/app/settings/scoring", label: "Scoring", managerOnly: true },
  { href: "/app/settings/follow-up", label: "Follow-up", managerOnly: true },
  { href: "/app/settings/integrations", label: "Integrations", managerOnly: true },
  { href: "/app/settings/data", label: "Data", managerOnly: true },
  { href: "/app/settings/notifications", label: "Notifications", managerOnly: false },
  { href: "/app/settings/profile", label: "Profile", managerOnly: false },
];

export function firstSettingsPath(role: OrgRole, isPlatformAdmin = false): string {
  return canManageOrgSettings(role, isPlatformAdmin)
    ? "/app/settings/organization"
    : "/app/settings/profile";
}

export const DEFAULT_APP_PATH = "/app/queue";
