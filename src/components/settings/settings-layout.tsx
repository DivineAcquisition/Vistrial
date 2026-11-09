"use client";

import type { ReactNode } from "react";

import { ROLE_WORDS, SettingsNav, sectionsFor, type Role, type SettingsSection } from "@/components/settings/settings-parts";
import { PageHeader } from "@/components/ui/page-header";

/** The Settings page: one header, the groups on the left (a select on a phone), the chosen group on the right. */
export function SettingsLayout({
  role,
  section,
  onSection,
  hrefFor,
  children,
}: {
  role: Role;
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  hrefFor: (section: SettingsSection) => string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-2">
      <PageHeader
        eyebrow={ROLE_WORDS[role]}
        title="Settings"
        description={
          role === "rep"
            ? "Your own choices: theme, notices and sign-in."
            : role === "owner"
              ? "Each setting says what is true now. Changes that reach the whole workspace say so, and are recorded."
              : "You can see the workspace settings. An owner changes them; your own choices are under You."
        }
        className="mb-6"
      />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <aside className="min-w-0 lg:sticky lg:top-4">
          <SettingsNav sections={sectionsFor(role)} current={section} hrefFor={hrefFor} onSelect={onSection} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
