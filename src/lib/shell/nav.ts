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

export type AttentionKey = "approvals" | "dueToday" | "escalations" | "queue";

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
    id: "compass",
    label: "Compass",
    roles: "Owner, Member, Operator, Service Team, Admin",
    reason:
      "Compass is not a main item. It sits under Agents for Owners and staff, and opens from Ask Compass in the top bar for everyone who can use it.",
  },
  {
    id: "operator-logs",
    label: "Operator Logs",
    roles: "Service Team, Admin",
    reason: "No operator-log screen yet. Logging an outcome stays at /app/log.",
  },
  {
    id: "assignments",
    label: "Assignments",
    roles: "Admin",
    reason: "Assignments are edited on Workspaces (/app/team). There is no separate page.",
  },
  {
    id: "billing-hidden-note",
    label: "Billing note",
    roles: "Admin",
    reason: "Billing is in the platform group at /app/team/billing. This placeholder id stays out of the shell.",
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

const COMPASS_ITEM: ShellNavItem = {
  id: "compass",
  label: "Compass",
  href: "/app/compass",
  match: "/app/compass",
  icon: "agents",
  description: "Ask about your leads, calls and numbers.",
};

const AGENTS_ITEM: ShellNavItem = {
  id: "agents",
  label: "Agents",
  href: "/app/agents",
  match: "/app/agents",
  icon: "agents",
  description: "Who is working right now, and what each agent did.",
  children: [COMPASS_ITEM],
};

function resultsItem(withForsight: boolean): ShellNavItem {
  return {
    id: "results",
    label: "Results",
    href: "/app/results",
    match: "/app/results",
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
            href: "/app/results",
            match: "/app/results",
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
              label: "My day",
              href: "/app/today",
              match: "/app/today",
              icon: "today",
              badge: "dueToday",
              description: "What needs you now.",
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
      id: "staff-home",
      label: "Today",
      href: "/app/team",
      match: "/app/team",
      icon: "today",
      description: "What needs you across your workspaces.",
      phone: 1,
    },
    {
      id: "queue",
      label: "Queue",
      href: "/app/team/queue",
      match: "/app/team/queue",
      icon: "leads",
      description: "Requests and escalations.",
      badge: "queue",
      phone: 2,
    },
    {
      id: "roster",
      label: "Client Roster",
      href: "/app/team/roster",
      match: "/app/team/roster",
      icon: "roster",
      description: "Workspaces you can enter.",
      phone: 3,
    },
    {
      id: "staff-onboarding",
      label: "Onboarding",
      href: "/app/team/onboarding",
      match: "/app/team/onboarding",
      icon: "activity",
      description: "Workspaces getting ready to go live.",
    },
    {
      id: "connections",
      label: "Connections",
      href: "/app/team/connections",
      match: "/app/team/connections",
      icon: "configuration",
    },
    {
      id: "oversight",
      label: "Agent oversight",
      href: "/app/team/agents",
      match: "/app/team/agents",
      icon: "agents",
    },
    {
      id: "staff-compass",
      label: "Compass",
      href: "/app/team/compass",
      match: "/app/team/compass",
      icon: "agents",
      description: "Shared conversations, limits, and how answers are going.",
    },
    {
      id: "notices",
      label: "Review notices",
      href: "/app/team/notices",
      match: "/app/team/notices",
      icon: "activity",
    },
  ];
  if (input.templateAccess) {
    team.push({
      id: "templates",
      label: "Templates",
      href: "/app/team/templates",
      match: "/app/team/templates",
      icon: "templates",
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
          id: "billing",
          label: "Billing",
          href: "/app/team/billing",
          match: "/app/team/billing",
          icon: "settings",
        },
        {
          id: "activity",
          label: "Audit log",
          href: "/app/team/activity",
          match: "/app/team/activity",
          icon: "activity",
        },
        {
          id: "staff",
          label: "Staff",
          href: "/app/team/staff",
          match: "/app/team/staff",
          icon: "profile",
        },
        {
          id: "metrics",
          label: "Metrics",
          href: "/app/team/metrics",
          match: "/app/team/metrics",
          icon: "results",
        },
        {
          id: "health-rules",
          label: "Health rules",
          href: "/app/team/health-rules",
          match: "/app/team/health-rules",
          icon: "health",
        },
        {
          id: "support",
          label: "Support",
          href: "/app/team/support",
          match: "/app/team/support",
          icon: "settings",
        },
        {
          id: "sign-in",
          label: "Sign-in",
          href: "/app/team/security",
          match: "/app/team/security",
          icon: "defaults",
        },
        {
          id: "updates",
          label: "What is new",
          href: "/app/team/updates",
          match: "/app/team/updates",
          icon: "layouts",
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
      phone: 4,
    },
    {
      id: "cases",
      label: "Case Files",
      href: "/app/cases",
      match: "/app/cases",
      icon: "cases",
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
  if (item.id === "staff-home") return pathname === "/app/team";
  if (item.id === "roster") {
    return pathname === "/app/team/roster" || pathname.startsWith("/app/team/workspaces/");
  }
  if (item.id === "queue") {
    return (
      pathname.startsWith("/app/team/queue") ||
      pathname.startsWith("/app/team/requests") ||
      pathname.startsWith("/app/team/data-requests")
    );
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
  if (item.id === "results") {
    return isNavActive(pathname, item.match) || isNavActive(pathname, "/portal");
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
  { prefix: "/app/team/activity", title: "Audit log", crumbs: [{ href: "/app/team/activity", label: "Audit log" }] },
  { prefix: "/app/team/queue", title: "Requests and escalations", crumbs: [{ href: "/app/team/queue", label: "Queue" }] },
  { prefix: "/app/team/roster/requests/settings", title: "Request settings", crumbs: [{ href: "/app/team/roster", label: "Client Roster" }, { href: "/app/team/roster/requests", label: "Access requests" }, { href: "/app/team/roster/requests/settings", label: "Settings" }] },
  { prefix: "/app/team/roster/requests", title: "Access requests", crumbs: [{ href: "/app/team/roster", label: "Client Roster" }, { href: "/app/team/roster/requests", label: "Access requests" }] },
  { prefix: "/app/team/roster", title: "Client Roster", crumbs: [{ href: "/app/team/roster", label: "Client Roster" }] },
  { prefix: "/app/team/onboarding", title: "Onboarding", crumbs: [{ href: "/app/team/onboarding", label: "Onboarding" }] },
  { prefix: "/app/team/connections", title: "Connections", crumbs: [{ href: "/app/team/connections", label: "Connections" }] },
  { prefix: "/app/team/compass/help", title: "Help articles", crumbs: [{ href: "/app/team/compass", label: "Compass" }, { href: "/app/team/compass/help", label: "Help articles" }] },
  { prefix: "/app/team/compass", title: "Compass", crumbs: [{ href: "/app/team/compass", label: "Compass" }] },
  { prefix: "/app/team/agents", title: "Agent oversight", crumbs: [{ href: "/app/team/agents", label: "Agent oversight" }] },
  { prefix: "/app/team/data-requests", title: "Data requests", crumbs: [{ href: "/app/team/queue", label: "Queue" }, { href: "/app/team/data-requests", label: "Data requests" }] },
  { prefix: "/app/team/metrics", title: "Metrics", crumbs: [{ href: "/app/team/metrics", label: "Metrics" }] },
  { prefix: "/app/team/health-rules", title: "Health rules", crumbs: [{ href: "/app/team/health-rules", label: "Health rules" }] },
  { prefix: "/app/team/support", title: "Support", crumbs: [{ href: "/app/team/support", label: "Support" }] },
  { prefix: "/app/team/security", title: "Sign-in", crumbs: [{ href: "/app/team/security", label: "Sign-in" }] },
  { prefix: "/app/team/enter", title: "Enter workspace", crumbs: [{ href: "/app/team/roster", label: "Client Roster" }, { href: "/app/team/enter", label: "Enter" }] },
  { prefix: "/app/team/staff", title: "Staff", crumbs: [{ href: "/app/team/staff", label: "Staff" }] },
  { prefix: "/app/team/holds", title: "Holding area", crumbs: [{ href: "/app/team/holds", label: "Holding area" }] },
  { prefix: "/app/team/notices", title: "Review notices", crumbs: [{ href: "/app/team/notices", label: "Review notices" }] },
  { prefix: "/app/team/workspaces", title: "Workspace", crumbs: [{ href: "/app/team/roster", label: "Client Roster" }, { href: "", label: "Workspace" }] },
  { prefix: "/app/team", title: "Today", crumbs: [{ href: "/app/team", label: "Today" }] },
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
  { prefix: "/app/tasks", title: "Tasks", crumbs: [{ href: "/app/tasks", label: "Tasks" }] },
  { prefix: "/app/today", title: "My day", crumbs: [{ href: "/app/today", label: "My day" }] },
  { prefix: "/app/settings/routing", title: "Routing", crumbs: [{ href: "/app/settings", label: "Settings" }, { href: "/app/settings/routing", label: "Routing" }] },
  { prefix: "/app/settings/install", title: "Install the app", crumbs: [{ href: "/app/settings", label: "Settings" }, { href: "/app/settings/install", label: "Install" }] },
  { prefix: "/app/queue", title: "My Leads", crumbs: [{ href: "/app/queue", label: "My Leads" }] },
  { prefix: "/app/home", title: "Overview", crumbs: [{ href: HOME_PATH, label: "Overview" }] },
  { prefix: "/app/forsight", title: "Forsight", crumbs: [{ href: "/app/results", label: "Results" }, { href: FORSIGHT_PATH, label: "Forsight" }] },
  { prefix: "/app/results/leads", title: "Results", crumbs: [{ href: "/app/results", label: "Results" }, { href: "", label: "Leads" }] },
  { prefix: "/app/results", title: "Results", crumbs: [{ href: "/app/results", label: "Results" }] },
  { prefix: "/app/help", title: "Help", crumbs: [{ href: "/app/help", label: "Help" }] },
  { prefix: "/app/notifications", title: "Notifications", crumbs: [{ href: "/app/notifications", label: "Notifications" }] },
  { prefix: "/app/agents/health", title: "Agent Health", crumbs: [{ href: "/app/agents", label: "Agents" }, { href: "/app/agents/health", label: "Agent Health" }] },
  { prefix: "/app/agents/simulator", title: "Simulator", crumbs: [{ href: "/app/agents", label: "Agents" }, { href: "/app/agents/simulator", label: "Simulator" }] },
  { prefix: "/app/agents/", title: "Agent", crumbs: [{ href: "/app/agents", label: "Agents" }, { href: "", label: "Agent" }] },
  { prefix: "/app/agents", title: "Agents", crumbs: [{ href: "/app/agents", label: "Agents" }] },
  { prefix: "/app/runs/", title: "Agent run", crumbs: [{ href: "/app/agents", label: "Agents" }, { href: "", label: "Run" }] },
  { prefix: "/app/compass/definitions", title: "How Compass counts", crumbs: [{ href: "/app/compass", label: "Compass" }, { href: "", label: "Definitions" }] },
  { prefix: "/app/compass", title: "Compass", crumbs: [{ href: "/app/agents", label: "Agents" }, { href: "/app/compass", label: "Compass" }] },
  { prefix: "/app/ask", title: "Ask Vistrial", crumbs: [{ href: "/app/compass", label: "Compass" }, { href: "", label: "Earlier work" }] },
  { prefix: "/app/onboarding", title: "Onboarding", crumbs: [{ href: "/app/onboarding", label: "Onboarding" }] },
  { prefix: "/portal", title: "Client report", crumbs: [{ href: "/app/results", label: "Results" }, { href: "/portal", label: "Client report" }] },
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
  if (pathname.startsWith("/app/ask") || pathname === "/app/compass") return "chat";
  if (pathname.startsWith("/app/onboarding")) return "workflow";
  if (pathname.startsWith("/login") || pathname.startsWith("/no-access") || pathname.startsWith("/auth")) {
    return "message";
  }
  if (
    pathname === "/app/team/roster" ||
    pathname.startsWith("/app/team/roster/requests") ||
    pathname === "/app/team/onboarding" ||
    pathname.startsWith("/app/team/queue") ||
    pathname.startsWith("/app/team/connections") ||
    pathname.startsWith("/app/team/activity") ||
    pathname.startsWith("/app/team/staff") ||
    pathname.startsWith("/app/team/holds") ||
    pathname.startsWith("/app/team/agents")
  ) {
    return "table";
  }
  if (pathname === "/app/team") return "dashboard";
  if (
    /^\/app\/team\/workspaces\/[^/]+/.test(pathname) ||
    /^\/app\/team\/data-requests\/[^/]+/.test(pathname) ||
    /^\/app\/team\/onboarding\/(?!settings(?:\/|$))[^/]+/.test(pathname)
  ) {
    return "record";
  }
  if (/^\/app\/cases\/[^/]+/.test(pathname) || /^\/app\/calls\/[^/]+/.test(pathname)) return "record";
  if (
    pathname.startsWith("/app/cases") ||
    pathname.startsWith("/app/today") ||
    pathname.startsWith("/app/queue") ||
    pathname.startsWith("/app/calls") ||
    pathname.startsWith("/app/follow-ups")
  ) {
    return "list-detail";
  }
  if (
    pathname.startsWith("/app/home") ||
    pathname.startsWith("/app/results") ||
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
