import type { OrgRole } from "@/types/database";

import { canManageOrgSettings } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  /** Prefix used for active-state, including nested routes. */
  match: string;
  roles?: OrgRole[];
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/app/queue", label: "Queue", match: "/app/queue" },
  { href: "/app/cases", label: "Case Files", match: "/app/cases" },
  { href: "/app/calls", label: "Calls", match: "/app/calls" },
  {
    href: "/app/reporting",
    label: "Reporting",
    match: "/app/reporting",
    roles: ["owner", "admin"],
  },
  { href: "/app/settings", label: "Settings", match: "/app/settings" },
];

export function navVisibleTo(item: NavItem, role: OrgRole): boolean {
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
  { href: "/app/settings/members", label: "Members", managerOnly: true },
  { href: "/app/settings/scoring", label: "Scoring", managerOnly: true },
  { href: "/app/settings/integrations", label: "Integrations", managerOnly: true },
  { href: "/app/settings/profile", label: "Profile", managerOnly: false },
];

export function firstSettingsPath(role: OrgRole): string {
  return canManageOrgSettings(role)
    ? "/app/settings/organization"
    : "/app/settings/profile";
}

export const DEFAULT_APP_PATH = "/app/queue";
