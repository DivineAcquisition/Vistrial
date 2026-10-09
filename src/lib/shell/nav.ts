import type { WorkspaceRole } from "@/lib/auth/types";

import { FORSIGHT_PATH, HOME_PATH, isNavActive } from "@/lib/navigation";

/**
 * Role navigation for the one application shell.
 *
 * Items link only to pages that role can already open. Anything without an
 * honest page is listed in HIDDEN_NAV and is not rendered. Later prompts turn
 * those on by giving them a real href.
 */

export type ShellIcon =
  | "overview"
  | "cases"
  | "results"
  | "settings"
  | "leads"
  | "today"
  | "profile"
  | "roster"
  | "templates"
  | "configuration"
  | "activity"
  | "defaults"
  | "layouts"
  | "forsight"
  | "agents"
  | "health";

export type AttentionKey = "approvals" | "dueToday" | "escalations";

export type AttentionCounts = Record<AttentionKey, number>;

export type ShellNavItem = {
  id: string;
  label: string;
  href: string;
  /** Prefix used for the active state. */
  match: string;
  icon: ShellIcon;
  description?: string;
  badge?: AttentionKey;
  /** Lower numbers sit in the phone bar. Omitted items go under More. */
  phone?: number;
  children?: ShellNavItem[];
};

export type ShellNavGroup = {
  id: string;
  label: string;
  items: ShellNavItem[];
};

export type ShellNavigation = {
  groups: ShellNavGroup[];
  phone: ShellNavItem[];
  more: ShellNavItem[];
};

export type HiddenNavItem = {
  id: string;
  label: string;
  roles: string;
  reason: string;
};

/**
 * Nav the shell does not show, because the page is not safe for that role yet
 * or it does not exist. Routes that already exist stay reachable by address
 * and by search when the role could already open them.
 */
export const HIDDEN_NAV: HiddenNavItem[] = [
  {
    id: "approvals",
    label: "Approvals",
    roles: "Owner, Member",
    reason:
      "No owner- or member-safe approvals screen. Pending items stay on Home for people who can already open Home. Settings → Approvals stays with the team.",
  },
  {
    id: "member-cases",
    label: "Case Files",
    roles: "Member",
    reason: "No member-safe case file screen. /app/cases stays in the working app.",
  },
  {
    id: "member-approvals",
    label: "Approvals",
    roles: "Member",
    reason: "Members are not granted approvals from the shell.",
  },
  {
    id: "member-agents",
    label: "Agents",
    roles: "Member",
    reason: "Members are not granted agents from the shell.",
  },
  {
    id: "ask",
    label: "Ask Vistrial",
    roles: "Owner, Operator, Service Team, Admin",
    reason:
      "The conversation stays at /app/ask and in search. It is not a new role destination in this shell.",
  },
  {
    id: "escalations",
    label: "Escalations",
    roles: "Service Team, Admin",
    reason: "No escalations screen yet. Escalated items stay on Home.",
  },
  {
    id: "operator-logs",
    label: "Operator Logs",
    roles: "Service Team, Admin",
    reason: "No operator-log screen yet. Logging an outcome stays at /app/log.",
  },
  {
    id: "onboarding",
    label: "Onboarding",
    roles: "Service Team, Admin",
    reason:
      "Onboarding is still the workspace setup flow at /app/onboarding, not a staff list of onboardings.",
  },
  {
    id: "assignments",
    label: "Assignments",
    roles: "Admin",
    reason: "Assignments are edited on Workspaces (/app/team). There is no separate page.",
  },
  {
    id: "billing",
    label: "Billing",
    roles: "Admin",
    reason: "No platform billing screen yet.",
  },
  {
    id: "template-library",
    label: "Template Library",
    roles: "Admin",
    reason: "The template list at /app/team/templates is the library. It is shown once, as Templates.",
  },
  {
    id: "workspaces-duplicate",
    label: "Workspaces",
    roles: "Admin",
    reason: "Workspaces is the same page as Client Roster (/app/team). It is shown once.",
  },
];

const FORSIGHT: ShellNavItem = {
  id: "forsight",
  label: "Forsight",
  href: FORSIGHT_PATH,
  match: FORSIGHT_PATH,
  icon: "forsight",
  description: "Ads, creatives, and pipeline for this workspace.",
};

const AGENTS_ITEM: ShellNavItem = {
  id: "agents",
  label: "Agents",
  href: "/app/agents",
  match: "/app/agents",
  icon: "agents",
  description: "Who is working right now, and what each agent did.",
};

function resultsItem(withForsight: boolean): ShellNavItem {
  return {
    id: "results",
    label: "Results",
    href: "/portal",
    match: "/portal",
    icon: "results",
    description: "Whether this workspace is turning leads into clients.",
    children: withForsight ? [FORSIGHT] : undefined,
  };
}

function customerViews(role: WorkspaceRole): ShellNavItem[] {
  const staff = role === "service_team" || role === "platform_admin";
  return [
    {
      id: "overview",
      label: "Overview",
      href: HOME_PATH,
      match: HOME_PATH,
      icon: "overview",
      badge: staff ? "escalations" : "approvals",
      phone: 1,
    },
    {
      id: "cases",
      label: "Case Files",
      href: "/app/cases",
      match: "/app/cases",
      icon: "cases",
      phone: 2,
    },
    { ...resultsItem(true), phone: 3 },
    AGENTS_ITEM,
    {
      id: "settings",
      label: "Settings",
      href: "/app/settings",
      match: "/app/settings",
      icon: "settings",
      phone: 4,
    },
  ];
}

function workspaceGroup(items: ShellNavItem[]): ShellNavGroup {
  return { id: "workspace", label: "Workspace", items };
}

export function shellNavigation(input: {
  role: WorkspaceRole;
  templateAccess: boolean;
  /** Names the staff "this workspace" group. The group stays put on every page. */
  workspaceName?: string;
}): ShellNavigation {
  const groups = groupsFor(input);
  const phone = groups
    .flatMap((group) => group.items)
    .filter((item) => item.phone != null)
    .sort((a, b) => (a.phone ?? 0) - (b.phone ?? 0))
    .slice(0, 4);
  const phoneIds = new Set(phone.map((item) => item.id));
  const more: ShellNavItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (!phoneIds.has(item.id)) more.push(item);
      for (const child of item.children ?? []) more.push(child);
    }
  }
  return { groups, phone, more };
}

function groupsFor(input: {
  role: WorkspaceRole;
  templateAccess: boolean;
  workspaceName?: string;
}): ShellNavGroup[] {
  switch (input.role) {
    case "member":
      return [
        workspaceGroup([
          {
            id: "overview",
            label: "Overview",
            href: HOME_PATH,
            match: HOME_PATH,
            icon: "overview",
            phone: 1,
          },
          {
            id: "results",
            label: "Results",
            href: "/portal",
            match: "/portal",
            icon: "results",
            phone: 2,
          },
        ]),
      ];
    case "operator":
      return [
        {
          id: "work",
          label: "Work",
          items: [
            {
              id: "leads",
              label: "My Leads",
              href: "/app/queue",
              match: "/app/queue",
              icon: "leads",
              phone: 1,
            },
            {
              id: "today",
              label: "Today",
              href: HOME_PATH,
              match: HOME_PATH,
              icon: "today",
              badge: "dueToday",
              description: "What is waiting, and what already happened.",
              phone: 2,
            },
            {
              id: "cases",
              label: "Case Files",
              href: "/app/cases",
              match: "/app/cases",
              icon: "cases",
              phone: 3,
            },
            {
              id: "profile",
              label: "Profile",
              href: "/app/settings/profile",
              match: "/app/settings/profile",
              icon: "profile",
              phone: 4,
            },
          ],
        },
      ];
    case "owner":
      return [workspaceGroup(customerViews("owner"))];
    case "service_team":
    case "platform_admin":
      return staffGroups(input);
    default:
      return [];
  }
}

function staffGroups(input: {
  role: WorkspaceRole;
  templateAccess: boolean;
  workspaceName?: string;
}): ShellNavGroup[] {
  const team: ShellNavItem[] = [
    {
      id: "roster",
      label: "Client Roster",
      href: "/app/team",
      match: "/app/team",
      icon: "roster",
      description: "Workspaces you can enter.",
      phone: 1,
    },
  ];
  if (input.templateAccess) {
    team.push({
      id: "templates",
      label: "Templates",
      href: "/app/team/templates",
      match: "/app/team/templates",
      icon: "templates",
      phone: 2,
    });
  }

  team.push({
    id: "agent-health",
    label: "Agent Health",
    href: "/app/agents/health",
    match: "/app/agents/health",
    icon: "health",
    description: "Agents that are stopped or erroring, across your workspaces.",
  });

  const groups: ShellNavGroup[] = [{ id: "team", label: "Team", items: team }];

  if (input.role === "platform_admin") {
    groups.push({
      id: "platform",
      label: "Platform",
      items: [
        {
          id: "activity",
          label: "Activity Log",
          href: "/app/team/activity",
          match: "/app/team/activity",
          icon: "activity",
        },
        {
          id: "defaults",
          label: "Platform Defaults",
          href: "/app/team/templates/platform",
          match: "/app/team/templates/platform",
          icon: "defaults",
        },
        {
          id: "layouts",
          label: "Layouts",
          href: "/app/layouts",
          match: "/app/layouts",
          icon: "layouts",
          description: "Internal reference for page layouts.",
        },
      ],
    });
  }

  const views: ShellNavItem[] = [
    {
      id: "overview",
      label: "Overview",
      href: HOME_PATH,
      match: HOME_PATH,
      icon: "overview",
      badge: "escalations",
      phone: 3,
    },
    {
      id: "cases",
      label: "Case Files",
      href: "/app/cases",
      match: "/app/cases",
      icon: "cases",
      phone: 4,
    },
    resultsItem(true),
    AGENTS_ITEM,
    {
      id: "configuration",
      label: "Configuration",
      href: "/app/settings/configuration",
      match: "/app/settings/configuration",
      icon: "configuration",
    },
  ];
  groups.push({ id: "here", label: input.workspaceName?.trim() || "This workspace", items: views });

  return groups;
}

/** Platform pages are not "inside" one customer workspace. */
export function isPlatformRoute(pathname: string): boolean {
  return ["/app/team", "/app/ops", "/app/layouts", "/app/agents/health"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isShellItemActive(pathname: string, hash: string, item: ShellNavItem): boolean {
  if (item.id === "roster") {
    return pathname === "/app/team";
  }
  if (item.id === "templates") {
    return (
      (pathname === "/app/team/templates" || pathname.startsWith("/app/team/templates/")) &&
      !pathname.startsWith("/app/team/templates/platform")
    );
  }
  if (item.id === "agents") {
    return isNavActive(pathname, item.match) && !pathname.startsWith("/app/agents/health");
  }
  if (item.id === "settings") {
    return isNavActive(pathname, item.match) && !pathname.startsWith("/app/settings/configuration");
  }
  if (item.id === "profile") {
    return pathname === item.match || pathname.startsWith(`${item.match}/`);
  }
  return isNavActive(pathname, item.match);
}

export function shellItemExpanded(pathname: string, hash: string, item: ShellNavItem): boolean {
  if (isShellItemActive(pathname, hash, item)) return true;
  return (item.children ?? []).some((child) => isShellItemActive(pathname, hash, child));
}

const TITLE_RULES: Array<{ prefix: string; title: string; crumbs: Array<{ href: string; label: string }> }> = [
  { prefix: "/app/layouts", title: "Layouts", crumbs: [{ href: "/app/layouts", label: "Layouts" }] },
  { prefix: "/app/team/templates/platform", title: "Platform Defaults", crumbs: [
    { href: "/app/team/templates", label: "Templates" },
    { href: "/app/team/templates/platform", label: "Platform Defaults" },
  ] },
  { prefix: "/app/team/templates", title: "Templates", crumbs: [{ href: "/app/team/templates", label: "Templates" }] },
  { prefix: "/app/team/activity", title: "Activity Log", crumbs: [{ href: "/app/team/activity", label: "Activity Log" }] },
  { prefix: "/app/team/staff", title: "Staff", crumbs: [{ href: "/app/team", label: "Client Roster" }, { href: "/app/team/staff", label: "Staff" }] },
  { prefix: "/app/team/holds", title: "Holding area", crumbs: [{ href: "/app/team", label: "Client Roster" }, { href: "/app/team/holds", label: "Holding area" }] },
  { prefix: "/app/team/notices", title: "Review notices", crumbs: [{ href: "/app/team", label: "Client Roster" }, { href: "/app/team/notices", label: "Review notices" }] },
  { prefix: "/app/team", title: "Client Roster", crumbs: [{ href: "/app/team", label: "Client Roster" }] },
  { prefix: "/app/ops", title: "System", crumbs: [{ href: "/app/ops", label: "System" }] },
  { prefix: "/app/settings/configuration", title: "Configuration", crumbs: [
    { href: "/app/settings", label: "Settings" },
    { href: "/app/settings/configuration", label: "Configuration" },
  ] },
  { prefix: "/app/settings", title: "Settings", crumbs: [{ href: "/app/settings", label: "Settings" }] },
  { prefix: "/app/cases/", title: "Case file", crumbs: [{ href: "/app/cases", label: "Case Files" }, { href: "", label: "Case file" }] },
  { prefix: "/app/cases", title: "Case Files", crumbs: [{ href: "/app/cases", label: "Case Files" }] },
  { prefix: "/app/calls/", title: "Call", crumbs: [{ href: "/app/calls", label: "Calls" }, { href: "", label: "Call" }] },
  { prefix: "/app/calls", title: "Calls", crumbs: [{ href: "/app/calls", label: "Calls" }] },
  { prefix: "/app/queue", title: "My Leads", crumbs: [{ href: "/app/queue", label: "My Leads" }] },
  { prefix: "/app/home", title: "Overview", crumbs: [{ href: HOME_PATH, label: "Overview" }] },
  { prefix: "/app/forsight", title: "Forsight", crumbs: [{ href: "/portal", label: "Results" }, { href: FORSIGHT_PATH, label: "Forsight" }] },
  { prefix: "/app/agents/health", title: "Agent Health", crumbs: [{ href: "/app/agents", label: "Agents" }, { href: "/app/agents/health", label: "Agent Health" }] },
  { prefix: "/app/agents/simulator", title: "Simulator", crumbs: [{ href: "/app/agents", label: "Agents" }, { href: "/app/agents/simulator", label: "Simulator" }] },
  { prefix: "/app/agents/", title: "Agent", crumbs: [{ href: "/app/agents", label: "Agents" }, { href: "", label: "Agent" }] },
  { prefix: "/app/agents", title: "Agents", crumbs: [{ href: "/app/agents", label: "Agents" }] },
  { prefix: "/app/runs/", title: "Agent run", crumbs: [{ href: "/app/agents", label: "Agents" }, { href: "", label: "Run" }] },
  { prefix: "/app/ask", title: "Ask Vistrial", crumbs: [{ href: "/app/ask", label: "Ask Vistrial" }] },
  { prefix: "/app/onboarding", title: "Onboarding", crumbs: [{ href: "/app/onboarding", label: "Onboarding" }] },
  { prefix: "/portal", title: "Results", crumbs: [{ href: "/portal", label: "Results" }] },
  { prefix: "/stellar/console", title: "Placements", crumbs: [{ href: "/stellar/console", label: "Placements" }] },
  { prefix: "/stellar/log", title: "Log", crumbs: [{ href: "/stellar/log", label: "Log" }] },
  { prefix: "/stellar/portal", title: "Portal", crumbs: [{ href: "/stellar/portal", label: "Portal" }] },
  { prefix: "/stellar", title: "Stellar", crumbs: [{ href: "/stellar", label: "Stellar" }] },
];

export function shellChrome(pathname: string): {
  title: string;
  crumbs: Array<{ href: string; label: string }>;
} {
  const match = [...TITLE_RULES].sort((a, b) => b.prefix.length - a.prefix.length).find((rule) =>
    pathname === rule.prefix || pathname.startsWith(rule.prefix.endsWith("/") ? rule.prefix : `${rule.prefix}/`) || pathname === rule.prefix
  );
  if (!match) return { title: "Vistrial", crumbs: [] };
  const crumbs = match.crumbs.filter((crumb) => crumb.href.length > 0 || crumb.label.length > 0);
  return { title: match.title, crumbs: crumbs.length > 1 ? crumbs : [] };
}

export type PageLayoutKind =
  | "standard"
  | "dashboard"
  | "list-detail"
  | "table"
  | "record"
  | "workflow"
  | "chat"
  | "message";

/** Which reusable layout a route sits in. Existing pages keep their own internals. */
export function layoutKindForPath(pathname: string): PageLayoutKind {
  if (pathname.startsWith("/app/ask")) return "chat";
  if (pathname.startsWith("/app/onboarding")) return "workflow";
  if (pathname.startsWith("/login") || pathname.startsWith("/no-access") || pathname.startsWith("/auth")) {
    return "message";
  }
  if (
    pathname === "/app/team" ||
    pathname.startsWith("/app/team/activity") ||
    pathname.startsWith("/app/team/staff") ||
    pathname.startsWith("/app/team/holds")
  ) {
    return "table";
  }
  if (/^\/app\/cases\/[^/]+/.test(pathname) || /^\/app\/calls\/[^/]+/.test(pathname)) return "record";
  if (
    pathname.startsWith("/app/cases") ||
    pathname.startsWith("/app/queue") ||
    pathname.startsWith("/app/calls") ||
    pathname.startsWith("/app/follow-ups")
  ) {
    return "list-detail";
  }
  if (
    pathname.startsWith("/app/home") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname.startsWith("/app/forsight") ||
    pathname.startsWith("/app/reporting")
  ) {
    return "dashboard";
  }
  return "standard";
}

/**
 * Width frame for an existing page. New layouts choose their own measure.
 * Settings and dashboards keep the current content width so moving them into
 * the shell does not reflow a working page.
 */
export function layoutFrameClass(kind: PageLayoutKind): string {
  switch (kind) {
    case "workflow":
      return "mx-auto w-full max-w-3xl";
    case "chat":
      return "h-full min-h-0";
    case "message":
      return "mx-auto flex min-h-[70vh] w-full max-w-md items-center";
    case "table":
      return "w-full min-w-0 max-w-none";
    default:
      return "mx-auto w-full min-w-0 max-w-[1400px]";
  }
}

export const SHELL_ROLE_LABEL: Record<WorkspaceRole, string> = {
  platform_admin: "Admin",
  service_team: "Service Team",
  owner: "Owner",
  member: "Member",
  operator: "Operator",
};

export function countFor(item: ShellNavItem, counts: AttentionCounts): number {
  if (!item.badge) return 0;
  return counts[item.badge] ?? 0;
}
