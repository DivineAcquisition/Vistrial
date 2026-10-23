"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutListIcon, MenuIcon, SunMediumIcon, UsersIcon } from "lucide-react";

import { ThemeToggle } from "@/components/app/theme-toggle";
import Logo from "@/components/brand/logo";
import { CommandBar } from "@/components/shell/command-bar";
import { LiveAside } from "@/components/shell/live-aside";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CatalogAgent } from "@/lib/shell/rail";
import { railFromCatalog } from "@/lib/shell/rail";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/app", label: "Decisions", icon: LayoutListIcon },
  { href: "/app/day", label: "My day", icon: SunMediumIcon },
  { href: "/app/leads", label: "Leads", icon: UsersIcon },
] as const;

function active(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function RailLinks({ agents, pathname, onNavigate }: { agents: CatalogAgent[]; pathname: string; onNavigate?: () => void }) {
  const rail = railFromCatalog(agents);
  const item = "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent";
  return (
    <div className="grid gap-6">
      {rail.compass ? (
        <div>
          <Link
            href={`/app/agents/${rail.compass.slug}`}
            onClick={onNavigate}
            aria-current={active(pathname, `/app/agents/${rail.compass.slug}`) ? "page" : undefined}
            className={cn(item, active(pathname, `/app/agents/${rail.compass.slug}`) && "bg-accent")}
          >
            <span>
              <span className="block font-medium">{rail.compass.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{rail.compass.job}</span>
            </span>
            <StatusBadge label="Off" />
          </Link>
        </div>
      ) : null}
      {rail.stages.map((group) => (
        <div key={group.stage}>
          <p className="px-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{group.label}</p>
          <ul className="mt-2 grid gap-1">
            {group.agents.map((agent) => {
              const href = `/app/agents/${agent.slug}`;
              return (
                <li key={agent.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active(pathname, href) ? "page" : undefined}
                    className={cn(item, active(pathname, href) && "bg-accent")}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{agent.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{agent.job}</span>
                    </span>
                    <StatusBadge label="Off" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <ul className="grid gap-1 border-t border-border pt-4">
        {[
          { href: "/app/connections", label: "Connections" },
          { href: "/app/settings", label: "Settings" },
        ].map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onNavigate}
              aria-current={active(pathname, link.href) ? "page" : undefined}
              className={cn(item, active(pathname, link.href) && "bg-accent")}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProductShell({ agents, children }: { agents: CatalogAgent[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-background focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh min-w-0">
        <aside className="hidden w-72 shrink-0 border-r border-border md:flex md:flex-col" aria-label="Workspace">
          <div className="px-4 py-4">
            <Link href="/app" aria-label="Vistrial home">
              <Logo className="h-7 w-auto" />
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
            <RailLinks agents={agents} pathname={pathname} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-border">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2" aria-label="Crew">
              {agents.map((agent) => (
                <span key={agent.slug} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-foreground">{agent.name}</span>
                  <StatusBadge label="Off" />
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="hidden min-w-0 flex-1 md:block">
                <CommandBar />
              </div>
              <button
                type="button"
                className="inline-flex h-12 flex-1 items-center rounded-xl border border-border px-4 text-sm text-muted-foreground md:hidden"
                aria-expanded={askOpen}
                aria-controls="compass-command"
                onClick={() => setAskOpen((open) => !open)}
              >
                Ask Compass
              </button>
              <ThemeToggle />
            </div>
            {askOpen ? (
              <div id="compass-command" className="px-4 pb-3 md:hidden">
                <CommandBar />
              </div>
            ) : null}
          </header>
          <div className="flex min-w-0 flex-1">
            <main id="workspace-main" className="min-w-0 flex-1 px-4 py-6 pb-28 md:px-8 md:pb-10">
              {children}
            </main>
            <aside aria-label="Live stream" className="hidden w-72 shrink-0 border-l border-border p-4 lg:block">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Live</p>
              <LiveAside />
            </aside>
          </div>
        </div>
      </div>
      {menuOpen ? (
        <div className="fixed inset-x-0 bottom-16 z-30 max-h-[70dvh] overflow-y-auto border-t border-border bg-background p-4 md:hidden">
          <RailLinks agents={agents} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
        </div>
      ) : null}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const on = active(pathname, tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 text-xs",
                    on ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-label="More"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex min-h-14 w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
            >
              <MenuIcon className="size-5" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
