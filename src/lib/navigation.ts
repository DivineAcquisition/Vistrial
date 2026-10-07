import type { OrgRole, SurfaceAccess } from "@/types/database";

import { canManageOrgSettings } from "@/lib/auth/permissions";
import { isProductScopeEnabled, type ProductScopeKey } from "@/lib/product-scope";

/**
 * The product is Forsight, people in this workspace, and a client portal.
 * The rail stays short. Jump (⌘J) still reaches the quieter tools.
 * DA-only screens stay in the console.
 */

export type NavGroupId = "front" | "door";

/**
 * Ads, creatives, and pipeline for this workspace. pulse.vistrial.io lands
 * here, so the hostname and the sidebar agree on one path.
 */
export const FORSIGHT_PATH = "/app/forsight";

/** The front door: a conversation with Vistrial, already primed on this workspace. */
export const ASK_PATH = "/app/ask";

export const MORE_PATH = "/app/more";

/** Outcomes first: booked calls, what they cost, and what is waiting on a person. */
export const HOME_PATH = "/app/home";

export const NAV_GROUPS: Array<{ id: NavGroupId; label: string }> = [
  { id: "front", label: "" },
  { id: "door", label: "" },
];

export type NavIcon =
  | "home"
  | "ask"
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
  /** When set, the item is hidden unless that product-scope flag is on. */
  scope?: ProductScopeKey;
};

/**
 * Owner and admin: Home, Forsight, People, Settings. Setter and closer: Home,
 * To call, People, Settings. Portal lives on the account menu. The list is not the
 * owner's front door.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    href: HOME_PATH,
    label: "Home",
    match: HOME_PATH,
    group: "front",
    icon: "home",
    description: "Booked calls, what they cost, and what needs your approval.",
  },
  {
    href: ASK_PATH,
    label: "Ask Vistrial",
    match: ASK_PATH,
    group: "front",
    icon: "ask",
    description: "Where your leads are leaking, and what to do about it.",
  },
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
    href: "/app/queue",
    label: "To call",
    match: "/app/queue",
    group: "front",
    icon: "queue",
    roles: ["setter", "closer", "operator"],
  },
  {
    href: "/app/cases",
    label: "People",
    match: "/app/cases",
    group: "front",
    icon: "cases",
    description: "Everyone in this workspace. Vistrial stores them here.",
  },
  {
    href: "/app/settings",
    label: "Settings",
    match: "/app/settings",
    group: "front",
    icon: "settings",
    description: "People, connections, and how this workspace is set up.",
  },
];

/**
 * Reachable from jump and from /app/more, not from the rail.
 * Coaching, Activity, and Numbers stay in the product; only Divine
 * Acquisition sees them on this list.
 */
export const MORE_NAV: NavItem[] = [
  {
    href: "/portal",
    label: "Portal",
    match: "/portal",
    group: "door",
    icon: "reporting",
    roles: ["owner", "admin"],
    description: "Whether this workspace is turning leads into clients.",
  },
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
    description: "Record a call or message after it happened.",
  },
  {
    href: "/app/cases",
    label: "People",
    match: "/app/cases",
    group: "door",
    icon: "cases",
    description: "Everyone in this workspace. Vistrial stores them here.",
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

export function navVisibleTo(item: NavItem, role: OrgRole, isStaff = false): boolean {
  if (item.scope && !isProductScopeEnabled(item.scope)) return false;
  // "platformAdminOnly" predates the Service Team: it means Vistrial staff
  // working this workspace.
  if (item.platformAdminOnly) return isStaff;
  if (isStaff) return true;
  if (!item.roles) return true;
  return item.roles.includes(role);
}

export function isNavActive(pathname: string, match: string): boolean {
  return pathname === match || pathname.startsWith(`${match}/`);
}

/**
 * Who sees each settings tab. "everyone": your own profile and notifications.
 * "owner": owners and staff (business contact details, your own people).
 * "staff": configuration, which the Vistrial team runs.
 */
export type SettingsTabAccess = "everyone" | "owner" | "staff";

export const SETTINGS_TABS: Array<{
  href: string;
  label: string;
  access: SettingsTabAccess;
}> = [
  { href: "/app/settings/profile", label: "You", access: "everyone" },
  { href: "/app/settings/notifications", label: "Notifications", access: "everyone" },
  { href: "/app/settings/history", label: "History", access: "everyone" },
  { href: "/app/settings/organization", label: "Workspace", access: "owner" },
  { href: "/app/settings/members", label: "People", access: "owner" },
  { href: "/app/settings/approvals", label: "Approvals", access: "staff" },
  { href: "/app/settings/integrations", label: "Integrations", access: "staff" },
  { href: "/app/settings/advanced", label: "Advanced", access: "staff" },
];

export const ADVANCED_SETTINGS_PAGES: Array<{
  href: string;
  label: string;
  description: string;
  /** Hidden from client Advanced. Divine Acquisition only. */
  platformAdminOnly?: boolean;
  /** When set, the page is omitted unless that product-scope flag is on. */
  scope?: ProductScopeKey;
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
    scope: "followUpSettings",
  },
  {
    href: "/app/settings/data",
    label: "Data",
    description: "Download a copy of this workspace.",
  },
  {
    href: "/app/settings/vistrial",
    label: "Posting and approvals",
    description: "What Vistrial may post or save outside Vistrial, where it goes, and what waits for your OK.",
  },
];

export function advancedSettingsVisibleTo(isStaff: boolean) {
  return ADVANCED_SETTINGS_PAGES.filter(
    (page) =>
      (!page.platformAdminOnly || isStaff) && (!page.scope || isProductScopeEnabled(page.scope))
  );
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

export function settingsTabsVisibleTo(role: OrgRole, isStaff = false) {
  const staff = canManageOrgSettings(role, isStaff);
  const owner = staff || role === "owner";
  return SETTINGS_TABS.filter(
    (tab) => tab.access === "everyone" || (tab.access === "owner" && owner) || staff
  );
}

export function firstSettingsPath(role: OrgRole, isStaff = false): string {
  return canManageOrgSettings(role, isStaff) || role === "owner"
    ? "/app/settings/organization"
    : "/app/settings/profile";
}

export const DEFAULT_APP_PATH = "/app/queue";

/**
 * Where someone lands after sign-in. Members open the customer views. Owners
 * and staff open Home for this workspace, with the conversation one click
 * away. Operators open their list.
 */
export function landingPath(
  surfaceAccess: SurfaceAccess | undefined,
  role?: OrgRole | null
): string {
  if (role === "member" || role === "client_viewer") return "/portal";
  if (role === "owner" || role === "admin") return HOME_PATH;
  if (!role && surfaceAccess === "portal") return "/portal";
  return DEFAULT_APP_PATH;
}
