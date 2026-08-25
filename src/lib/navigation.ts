import type { OrgRole } from "@/types/database";

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

export type NavIcon = "queue" | "log" | "cases" | "calls" | "reporting" | "settings";

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
  { href: "/app/log", label: "Log", match: "/app/log", group: "work", icon: "log" },
  { href: "/app/cases", label: "Case Files", match: "/app/cases", group: "work", icon: "cases" },
  { href: "/app/calls", label: "Calls", match: "/app/calls", group: "work", icon: "calls" },
  {
    href: "/app/coaching",
    label: "Coaching",
    match: "/app/coaching",
    group: "work",
    icon: "reporting",
  },
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
  { href: "/app/settings/profile", label: "Profile", managerOnly: false },
  { href: "/app/settings/notifications", label: "Notifications", managerOnly: false },
  { href: "/app/settings/app", label: "App", managerOnly: false },
  { href: "/app/settings/workspace", label: "Workspace", managerOnly: true },
];

export const ADVANCED_TABS: Array<{ href: string; label: string; ownerOnly?: boolean }> = [
  { href: "/app/settings/advanced/scoring", label: "Scoring" },
  { href: "/app/settings/advanced/integrations", label: "Integrations" },
  { href: "/app/settings/advanced/follow-up", label: "Follow-up" },
  { href: "/app/settings/advanced/data", label: "Data", ownerOnly: true },
  { href: "/app/settings/advanced/activity", label: "Activity" },
  { href: "/app/settings/advanced/activation", label: "Activation" },
];

export function firstSettingsPath(_role?: OrgRole, _isPlatformAdmin = false): string {
  return "/app/settings/profile";
}

export const DEFAULT_APP_PATH = "/app/queue";
