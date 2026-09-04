import type { OrgRole, SurfaceAccess } from "@/types/database";

import { canManageOrgSettings } from "@/lib/auth/permissions";

/**
 * The product is Forsight and a client portal. Every client is a workspace.
 * Sales tools stay reachable behind More. DA-only screens stay in the console.
 */

export type NavGroupId = "front" | "door";

/**
 * Ads, creatives, and pipeline for this workspace. pulse.vistrial.io lands
 * here, so the hostname and the sidebar agree on one path.
 */
export const FORSIGHT_PATH = "/app/forsight";

export const MORE_PATH = "/app/more";

export const NAV_GROUPS: Array<{ id: NavGroupId; label: string }> = [
  { id: "front", label: "" },
  { id: "door", label: "" },
];

export type NavIcon =
  | "queue"
  | "log"
  | "cases"
  | "calls"
  | "reporting"
  | "settings"
  | "activity"
  | "forsight"
  | "more"
  | "coaching";

export type NavItem = {
  href: string;
  label: string;
  /** Prefix used for active-state, including nested routes. */
  match: string;
  group: NavGroupId;
  icon: NavIcon;
  roles?: OrgRole[];
  platformAdminOnly?: boolean;
  /** Short line on the More door. */
  description?: string;
};

/**
 * Owner and admin: Forsight, Portal, More. Setter and closer: To call, More.
 * The list is not the owner's front door.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    href: FORSIGHT_PATH,
    label: "Forsight",
    match: FORSIGHT_PATH,
    group: "front",
    icon: "forsight",
    roles: ["owner", "admin"],
    description: "Ads, creatives, and pipeline for this workspace.",
  },
  {
    href: "/portal",
    label: "Portal",
    match: "/portal",
    group: "front",
    icon: "reporting",
    roles: ["owner", "admin"],
    description: "Whether this workspace is turning leads into clients.",
  },
  {
    href: "/app/queue",
    label: "To call",
    match: "/app/queue",
    group: "front",
    icon: "queue",
    roles: ["setter", "closer"],
  },
  {
    href: MORE_PATH,
    label: "More",
    match: MORE_PATH,
    group: "door",
    icon: "more",
  },
];

/**
 * Behind the door. Sales tools stay here so they are not the story.
 * Coaching, Activity, and Numbers stay in the product; only Divine
 * Acquisition sees them on this list.
 */
export const MORE_NAV: NavItem[] = [
  {
    href: "/app/queue",
    label: "To call",
    match: "/app/queue",
    group: "door",
    icon: "queue",
    description: "People waiting to be contacted, in order.",
  },
  {
    href: "/app/log",
    label: "What happened",
    match: "/app/log",
    group: "door",
    icon: "log",
    description: "Record a call or message after you come back from the CRM.",
  },
  {
    href: "/app/cases",
    label: "People",
    match: "/app/cases",
    group: "door",
    icon: "cases",
    description: "Find anyone in this workspace, not only who to call next.",
  },
  {
    href: "/app/calls",
    label: "Calls",
    match: "/app/calls",
    group: "door",
    icon: "calls",
    description: "Recordings and what was said.",
  },
  {
    href: "/app/settings",
    label: "Settings",
    match: "/app/settings",
    group: "door",
    icon: "settings",
    description: "People, connections, and how this workspace is set up.",
  },
  {
    href: "/app/coaching",
    label: "Coaching",
    match: "/app/coaching",
    group: "door",
    icon: "coaching",
    platformAdminOnly: true,
    description: "What to practice after the calls, not during them.",
  },
  {
    href: "/app/activity",
    label: "Activity",
    match: "/app/activity",
    group: "door",
    icon: "activity",
    platformAdminOnly: true,
    description: "The stream of what this workspace did.",
  },
  {
    href: "/app/reporting",
    label: "Numbers",
    match: "/app/reporting",
    group: "door",
    icon: "reporting",
    platformAdminOnly: true,
    description: "The operational figures behind the portal.",
  },
];

/** Divine Acquisition only. Never in the client's sidebar. */
export const DA_CONSOLE_LINKS: Array<{ href: string; label: string; description: string }> = [
  { href: "/app/ops", label: "System", description: "Jobs, alerts, and ingestion across clients." },
  {
    href: "/app/settings/agents",
    label: "Agents",
    description: "How work is routed. Not a client control.",
  },
  {
    href: `${FORSIGHT_PATH}/sources`,
    label: "Tracking sources",
    description: "Where ads and pipeline numbers are read from.",
  },
  {
    href: `${FORSIGHT_PATH}/workspaces`,
    label: "All workspaces",
    description: "Every client workspace.",
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

export const ADVANCED_SETTINGS_PREFIXES = [
  ...ADVANCED_SETTINGS_PAGES.map((page) => page.href),
  "/app/settings/agents",
];

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

/**
 * Where someone lands after sign-in. Portal-only members stay in the portal.
 * Owners and admins open Forsight for this workspace. People who work leads
 * open the list.
 */
export function landingPath(
  surfaceAccess: SurfaceAccess | undefined,
  role?: OrgRole | null
): string {
  if (surfaceAccess === "portal") return "/portal";
  if (role === "owner" || role === "admin") return FORSIGHT_PATH;
  return DEFAULT_APP_PATH;
}
