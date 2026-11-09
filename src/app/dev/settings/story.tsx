"use client";

import { useState } from "react";

import { SettingsLayout } from "@/components/settings/settings-layout";
import { parseSection, type Role, type SettingsSection } from "@/components/settings/settings-parts";
import {
  AgentsSection,
  BillingSection,
  BusinessSection,
  DataSection,
  PeopleSection,
  YouSection,
  type AgentsData,
  type BusinessData,
  type PeopleData,
  type SupportGrant,
  type YouData,
} from "@/components/settings/settings-sections";
import { Panel } from "@/components/ui/panel";
import { saveTheme, type ThemeChoice } from "@/lib/theme";
import { CATALOG } from "@/lib/shell/rail";

const NOW = 1794240000000; // Nov 9, 2026
const DAY = 86_400_000;

const BUSINESS: BusinessData = {
  name: "Bay Area Cleaning Professionals",
  defaultCountry: "US",
  timezone: "America/Los_Angeles",
  canEdit: true,
  profile: { state: "confirmed", version: 3 },
  factCount: 14,
};

const PEOPLE: PeopleData = {
  canManage: true,
  me: "m1",
  members: [
    { id: "m1", name: "Malik Sannie", email: "malik@bayareacleaning.com", role: "owner", joinedAt: NOW - 140 * DAY },
    { id: "m2", name: "Dana Ortiz", email: "dana@bayareacleaning.com", role: "manager", joinedAt: NOW - 60 * DAY },
    { id: "m3", name: "Jordan Lee", email: "jordan@bayareacleaning.com", role: "rep", joinedAt: NOW - 12 * DAY },
    { id: "m4", name: "Sam Patel", email: null, role: "rep", joinedAt: NOW - 3 * DAY },
  ],
  invites: [{ id: "i1", email: "taylor@bayareacleaning.com", role: "rep", sentAt: NOW - 2 * DAY, expiresAt: NOW + 5 * DAY }],
  supportAccess: true,
};

const GRANTS: SupportGrant[] = [
  {
    id: "g1",
    who: "Vistrial support",
    staffRef: "a91c2f",
    reason: "Owner asked why the October report left out Meta results",
    startsAt: NOW - 1 * DAY,
    expiresAt: NOW - 1 * DAY + 4 * 3_600_000,
    revokedAt: null,
    open: false,
    opens: 2,
    lastOpenedAt: NOW - 1 * DAY + 3_600_000,
  },
  {
    id: "g2",
    who: "Vistrial support",
    staffRef: "a91c2f",
    reason: "Helping set up the first results file import",
    startsAt: NOW - 30 * DAY,
    expiresAt: NOW - 29 * DAY,
    revokedAt: NOW - 30 * DAY + 2 * 3_600_000,
    open: false,
    opens: 1,
    lastOpenedAt: NOW - 30 * DAY + 3_600_000,
  },
];

function agents(canEdit: boolean): AgentsData {
  return {
    canEdit,
    defaultResearchMode: "thorough",
    agents: CATALOG.map((agent) => ({
      slug: agent.slug,
      name: agent.name,
      job: agent.job,
      status: agent.status === "live" ? "live" : "planned",
      state: agent.status === "live" ? "on" : "off",
      skills: agent.skills.map((skill) => ({ slug: skill.slug, name: skill.name, status: skill.status })),
    })),
    controls: {
      paused: false,
      halted: false,
      maxCostCentsPerRun: 250,
      maxCostCentsPerDay: 2000,
      daySpentCents: 318,
      ceiling: { maxCostCentsPerRun: 1000, maxCostCentsPerDay: 10_000 },
    },
  };
}

const done = () => Promise.resolve(null);

export function SettingsStory({ section: asked, role: askedRole, support }: { section: string | null; role: string | null; support: boolean }) {
  const role: Role = askedRole === "manager" || askedRole === "rep" ? askedRole : "owner";
  const owner = role === "owner";
  const [section, setSection] = useState<SettingsSection>(parseSection(asked, role));
  const [business, setBusiness] = useState<BusinessData>({ ...BUSINESS, canEdit: owner });
  const [people, setPeople] = useState<PeopleData>({ ...PEOPLE, canManage: owner, me: role === "owner" ? "m1" : role === "manager" ? "m2" : "m3", supportAccess: support });
  const [agentData, setAgentData] = useState<AgentsData>(agents(owner));
  const [you, setYou] = useState<YouData>({
    name: role === "owner" ? "Malik Sannie" : role === "manager" ? "Dana Ortiz" : "Jordan Lee",
    email: role === "owner" ? "malik@bayareacleaning.com" : role === "manager" ? "dana@bayareacleaning.com" : "jordan@bayareacleaning.com",
    role,
    joinedAt: NOW - 60 * DAY,
    theme: "system",
    notifications: { checkInsDue: true, questionsWaiting: true, reportReady: false },
  });

  const hrefFor = (next: SettingsSection) => `/dev/settings?section=${next}&role=${role}`;
  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8">
      <SettingsLayout role={role} section={section} onSection={setSection} hrefFor={hrefFor}>
        {section === "business" ? (
          <BusinessSection
            role={role}
            data={business}
            memoryHref="/dev/settings?section=business"
            profileEditor={
              <Panel className="grid gap-2 p-4 text-sm text-muted-foreground">
                <p className="text-foreground">Offer: Deep cleaning and move-out cleans across the Bay Area, fixed prices.</p>
                <p>Audience: Busy homeowners and property managers. Geography: San Francisco to San Jose.</p>
                <p>The live page shows the full profile editor here.</p>
              </Panel>
            }
            onRename={async (name) => setBusiness((row) => ({ ...row, name: name.trim() }))}
            onCountry={async (country) => setBusiness((row) => ({ ...row, defaultCountry: country }))}
          />
        ) : null}
        {section === "people" ? (
          <PeopleSection
            role={role}
            data={people}
            grants={owner ? GRANTS : null}
            now={NOW}
            onInvite={async (email, inviteRole) => {
              setPeople((row) => ({ ...row, invites: [{ id: `i${Date.now()}`, email, role: inviteRole, sentAt: NOW, expiresAt: NOW + 7 * DAY }, ...row.invites] }));
              return { link: "https://app.vistrial.io/join?token=3f9c…example" };
            }}
            onCancelInvite={async (id) => setPeople((row) => ({ ...row, invites: row.invites.filter((invite) => invite.id !== id) }))}
            onRole={async (id, next) => setPeople((row) => ({ ...row, members: row.members.map((member) => (member.id === id ? { ...member, role: next } : member)) }))}
            onRemove={async (id) => setPeople((row) => ({ ...row, members: row.members.filter((member) => member.id !== id) }))}
            onSupport={async (on) => setPeople((row) => ({ ...row, supportAccess: on }))}
          />
        ) : null}
        {section === "agents" ? (
          <AgentsSection
            role={role}
            data={agentData}
            onAgent={async (slug, on) =>
              setAgentData((row) => ({ ...row, agents: row.agents.map((agent) => (agent.slug === slug ? { ...agent, state: on ? "on" : "off" } : agent)) }))
            }
            onMode={async (mode) => setAgentData((row) => ({ ...row, defaultResearchMode: mode }))}
            onPause={async (paused) => setAgentData((row) => ({ ...row, controls: row.controls && { ...row.controls, paused } }))}
            onCaps={done}
          />
        ) : null}
        {section === "data" ? (
          <DataSection
            role={role}
            data={{
              canManage: owner,
              files: 2,
              meta: { status: "connected", account: "Bay Area Cleaning Professionals", user: "Malik Sannie", usedBy: ["Growth Architect"] },
            }}
          />
        ) : null}
        {section === "billing" ? <BillingSection /> : null}
        {section === "you" ? (
          <YouSection
            data={you}
            onTheme={(theme: ThemeChoice) => {
              saveTheme(theme);
              setYou((row) => ({ ...row, theme }));
            }}
            onNotice={async (key, on) => setYou((row) => ({ ...row, notifications: { ...row.notifications, [key]: on } }))}
            onAccount={() => undefined}
          />
        ) : null}
      </SettingsLayout>
    </main>
  );
}
