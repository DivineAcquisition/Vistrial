"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  ArrowRight,
  BotIcon,
  Brain,
  Building2,
  Plug,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/components/ui/tone";
import { cardTitle, captionText, selectClass } from "@/lib/ui";
import { ROLE_LABEL, isAdmin, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

export type { Role };

export const SECTIONS = ["business", "people", "agents", "memory", "data", "billing", "you"] as const;
export type SettingsSection = (typeof SECTIONS)[number];

export const SECTION_META: Record<SettingsSection, { label: string; hint: string; icon: LucideIcon }> = {
  business: { label: "Business", hint: "Name, country and profile", icon: Building2 },
  people: { label: "People", hint: "Members, invites and support access", icon: Users },
  agents: { label: "Agents", hint: "Which agents run, caps and defaults", icon: BotIcon },
  memory: { label: "Memory", hint: "What Vistrial knows about the business", icon: Brain },
  data: { label: "Data", hint: "Your accounts and results files", icon: Plug },
  billing: { label: "Billing", hint: "Plan, credits and invoices", icon: Wallet },
  you: { label: "You", hint: "Theme, notices and sign-in", icon: User },
};

/** Owners and Admins see every group. Members and Viewers see their own section, and Memory, which everyone reads. */
export function sectionsFor(role: Role): SettingsSection[] {
  return isAdmin(role) ? [...SECTIONS] : ["you", "memory"];
}

export function parseSection(value: string | null | undefined, role: Role): SettingsSection {
  const allowed = sectionsFor(role);
  return allowed.includes(value as SettingsSection) ? (value as SettingsSection) : allowed[0];
}

export const ROLE_WORDS: Record<Role, string> = ROLE_LABEL;

const DAY = 86_400_000;

export function shortDate(at: number) {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function shortDateTime(at: number) {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function daysLeft(until: number, now: number) {
  const days = Math.max(0, Math.ceil((until - now) / DAY));
  return days === 1 ? "1 day" : `${days} days`;
}

/** The left column on wide screens; a select on a phone. Each group keeps its place in the URL. */
export function SettingsNav({
  sections,
  current,
  hrefFor,
  onSelect,
}: {
  sections: SettingsSection[];
  current: SettingsSection;
  hrefFor: (section: SettingsSection) => string;
  onSelect: (section: SettingsSection) => void;
}) {
  return (
    <>
      <label className="grid gap-1.5 text-sm lg:hidden">
        <span className={captionText}>Settings group</span>
        <select
          className={cn(selectClass, "w-full")}
          value={current}
          onChange={(event) => onSelect(event.target.value as SettingsSection)}
          aria-label="Settings group"
        >
          {sections.map((section) => (
            <option key={section} value={section}>
              {SECTION_META[section].label}: {SECTION_META[section].hint}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label="Settings groups" className="hidden lg:block">
        <ul className="grid gap-1">
          {sections.map((section) => {
            const meta = SECTION_META[section];
            const Icon = meta.icon;
            const active = section === current;
            return (
              <li key={section}>
                <Link
                  href={hrefFor(section)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey) return;
                    event.preventDefault();
                    onSelect(section);
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
                    active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-overlay/[0.05] hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", active && "text-primary")} />
                  <span className="grid min-w-0">
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{meta.hint}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/**
 * One setting, told as its current state. The sentence says what is true now; `affects` says who a change
 * reaches; controls sit underneath.
 */
export function StatusCard({
  icon: Icon,
  media,
  title,
  status,
  tone = "neutral",
  sentence,
  affects,
  children,
  footer,
  id,
}: {
  icon: LucideIcon;
  /** Shown in place of the icon, for a card about someone with a face (an agent). */
  media?: ReactNode;
  title: string;
  status?: string;
  tone?: Tone;
  sentence: ReactNode;
  affects?: string;
  children?: ReactNode;
  footer?: ReactNode;
  id?: string;
}) {
  return (
    <Panel as="section" className="grid min-w-0 gap-4 p-4 sm:p-5">
      <div id={id} className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {media ?? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
              <Icon aria-hidden className="size-4 text-muted-foreground" />
            </span>
          )}
          <div className="grid min-w-0 gap-1">
            <h3 className={cardTitle}>{title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{sentence}</p>
          </div>
        </div>
        {status ? <StatusBadge label={status} tone={tone} className="shrink-0 [&_span]:normal-case" /> : null}
      </div>
      {children ? <div className="grid min-w-0 gap-3">{children}</div> : null}
      {affects || footer ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
          {affects ? <p className={captionText}>{affects}</p> : <span />}
          {footer}
        </div>
      ) : null}
    </Panel>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
      {children} <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}

export function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-1">
      <h2 className="font-heading text-lg text-foreground">{title}</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** Said once per section to someone who can read but not change it. */
export function ReadOnlyNote({ role }: { role: Role }) {
  if (isAdmin(role)) return null;
  return (
    <p className="rounded-xl border border-border bg-overlay/[0.03] px-3 py-2 text-sm text-muted-foreground">
      You can see these as a {ROLE_WORDS[role].toLowerCase()}. An owner or admin changes them.
    </p>
  );
}
