import type { OrgRole, SurfaceAccess } from "@/types/database";

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

export type NavIcon = "queue" | "log" | "cases" | "calls" | "reporting" | "settings" | "activity";

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
    href: "/app/activity",
    label: "Activity",
    match: "/app/activity",
    group: "measure",
    icon: "activity",
    roles: ["owner", "admin"],
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
  { href: "/app/settings/profile", label: "You", managerOnly: false },
  { href: "/app/settings/notifications", label: "Notifications", managerOnly: false },
  { href: "/app/settings/organization", label: "Workspace", managerOnly: true },
  { href: "/app/settings/members", label: "People", managerOnly: true },
  { href: "/app/settings/integrations", label: "Integrations", managerOnly: true },
  { href: "/app/settings/advanced", label: "Advanced", managerOnly: true },
];

export const ADVANCED_SETTINGS_PAGES: Array<{
  href: string;
  label: string;
  description: string;
  /** Hidden from client Advanced. Divine Acquisition only. */
  platformAdminOnly?: boolean;
}> = [
  {
    href: "/app/settings/business-profile",
    label: "Business",
    description: "What this business is, and whether the workspace is live.",
  },
  {
    href: "/app/settings/scoring",
    label: "Scoring",
    description: "How ready someone has to be, and how long they can wait.",
  },
  {
    href: "/app/settings/follow-up",
    label: "Follow-up",
    description: "Voice examples, quiet hours, and which situations Vistrial drafts for.",
  },
  {
    href: "/app/settings/data",
    label: "Data",
    description: "Download a copy of this workspace.",
  },
  {
    href: "/app/settings/agents",
    label: "Agents",
    description: "Who may run on a schedule, what they may change, and the stop switch.",
    platformAdminOnly: true,
  },
];

export function advancedSettingsVisibleTo(isPlatformAdmin: boolean) {
  return ADVANCED_SETTINGS_PAGES.filter((page) => !page.platformAdminOnly || isPlatformAdmin);
}

export function advancedSettingsBreadcrumbs(label: string, href: string) {
  return [
    { label: "Advanced", href: "/app/settings/advanced" },
    { label, href },
  ];
}

export const ADVANCED_SETTINGS_PREFIXES = ADVANCED_SETTINGS_PAGES.map((page) => page.href);

export function settingsTabActiveHref(pathname: string): string {
  if (
    pathname === "/app/settings/advanced" ||
    ADVANCED_SETTINGS_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return "/app/settings/advanced";
  }
  const match = SETTINGS_TABS.find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  );
  return match?.href ?? pathname;
}

export function firstSettingsPath(role: OrgRole, isPlatformAdmin = false): string {
  return canManageOrgSettings(role, isPlatformAdmin)
    ? "/app/settings/organization"
    : "/app/settings/profile";
}

export const DEFAULT_APP_PATH = "/app/queue";

export function landingPath(surfaceAccess: SurfaceAccess | undefined): string {
  return surfaceAccess === "portal" ? "/portal" : DEFAULT_APP_PATH;
}
