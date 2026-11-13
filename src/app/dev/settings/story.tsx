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

import { AccountStory } from "../auth-pages/account-story";
import { saveTheme, type ThemeChoice } from "@/lib/theme";
import { CATALOG } from "@/lib/shell/rail";
import { ApprovalSettingsView, type ApprovalSettingsData } from "@/components/settings/approval-settings";
import { MemoryView, type MemoryFact } from "@/components/settings/memory-section";

/** What an agency's memory holds: facts with where each came from and whether a person confirmed it. */
const MEMORY: MemoryFact[] = [
  { id: "f1", factKey: "monthlyRetainer", value: "$4,500 a month for paid ads management, three month minimum", status: "verified", sourceType: "owner", recordedAt: Date.UTC(2026, 9, 2) },
  { id: "f2", factKey: "idealClient", value: "Coaches and consultants selling a program above $3,000", status: "verified", sourceType: "owner", recordedAt: Date.UTC(2026, 9, 2) },
  { id: "f3", factKey: "bookedCallsPerMonth", value: "About 22 booked sales calls a month across clients", status: "unverified", sourceType: "agent", recordedAt: Date.UTC(2026, 10, 4) },
  { id: "f4", factKey: "closeRate", value: "Roughly one in four booked calls becomes a client", status: "unverified", sourceType: "agent", recordedAt: Date.UTC(2026, 10, 4) },
  { id: "f5", factKey: "mainChannel", value: "Meta ads to a booking page, then a sales call", status: "verified", sourceType: "owner", recordedAt: Date.UTC(2026, 9, 14) },
  { id: "f6", factKey: "teamSize", value: "Five people: two media buyers, a copywriter, an account lead and the owner", status: "verified", sourceType: "owner", recordedAt: Date.UTC(2026, 8, 20) },
];

const NOW = 1794240000000; // Nov 9, 2026
const DAY = 86_400_000;

const BUSINESS: BusinessData = {
  name: "Northlight Growth",
  defaultCountry: "US",
  timezone: "America/Los_Angeles",
  canEdit: true,
  profile: { state: "confirmed", version: 3 },
  factCount: 14,
};

const PEOPLE: PeopleData = {
  canManage: true,
  isOwner: true,
  me: "m1",
  organizationName: "Northlight Growth",
  grantable: [
    { workspaceId: "w2", name: "Northlight Coaching" },
    { workspaceId: "w3", name: "Sannie Media" },
  ],
  members: [
    { id: "m1", name: "Malik Sannie", email: "malik@northlightgrowth.com", role: "owner", joinedAt: NOW - 140 * DAY },
    { id: "m2", name: "Dana Ortiz", email: "dana@northlightgrowth.com", role: "admin", joinedAt: NOW - 60 * DAY },
    { id: "m3", name: "Jordan Lee", email: "jordan@northlightgrowth.com", role: "member", joinedAt: NOW - 12 * DAY },
    { id: "m4", name: "Sam Patel", email: null, role: "viewer", joinedAt: NOW - 3 * DAY },
  ],
  invites: [{ id: "i1", email: "taylor@northlightgrowth.com", role: "member", organizations: [{ name: "Northlight Growth", role: "member" }, { name: "Northlight Coaching", role: "viewer" }], sentAt: NOW - 2 * DAY, expiresAt: NOW + 5 * DAY }],
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

export function SettingsStory({ section: asked, role: askedRole, support, account = "" }: { section: string | null; role: string | null; support: boolean; account?: string }) {
  const role: Role = askedRole === "admin" || askedRole === "member" || askedRole === "viewer" ? askedRole : "owner";
  const owner = role === "owner";
  const [section, setSection] = useState<SettingsSection>(parseSection(asked, role));
  const [business, setBusiness] = useState<BusinessData>({ ...BUSINESS, canEdit: owner });
  const [people, setPeople] = useState<PeopleData>({ ...PEOPLE, canManage: owner || role === "admin", isOwner: owner, me: role === "owner" ? "m1" : role === "admin" ? "m2" : "m3", supportAccess: support });
  const [agentData, setAgentData] = useState<AgentsData>(agents(owner));
  const [you, setYou] = useState<YouData>({
    name: role === "owner" ? "Malik Sannie" : role === "admin" ? "Dana Ortiz" : "Jordan Lee",
    email: role === "owner" ? "malik@northlightgrowth.com" : role === "admin" ? "dana@northlightgrowth.com" : "jordan@northlightgrowth.com",
    role,
    joinedAt: NOW - 60 * DAY,
    theme: "system",
    notifications: { checkInsDue: true, questionsWaiting: true, reportReady: false, email: true },
  });

  const [approval, setApproval] = useState<ApprovalSettingsData>({ spendApprovalCredits: 500, weeklyPlan: true, trendPosts: false, canEdit: true, min: 1, max: 100_000, trendCapCredits: 360 });
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
                <p className="text-foreground">Offer: Paid social and landing pages for coaches and course sellers, on a monthly retainer.</p>
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
            onInvite={async (email, inviteRole, extra) => {
              const organizations = [{ name: PEOPLE.organizationName, role: inviteRole }, ...extra.map((grant) => ({ name: PEOPLE.grantable.find((row) => row.workspaceId === grant.workspaceId)?.name ?? "", role: grant.role }))];
              setPeople((row) => ({ ...row, invites: [{ id: `i${Date.now()}`, email, role: inviteRole, organizations, sentAt: NOW, expiresAt: NOW + 7 * DAY }, ...row.invites] }));
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
        {section === "agents" ? (
          <div className="mt-8">
            <ApprovalSettingsView
              key={String(approval.spendApprovalCredits)}
              data={{ ...approval, canEdit: role === "owner" || role === "admin" }}
              onLimit={async (credits) => setApproval((row) => ({ ...row, spendApprovalCredits: credits }))}
              onSwitch={async (key, on) => setApproval((row) => ({ ...row, [key]: on }))}
            />
          </div>
        ) : null}
        {section === "data" ? (
          <DataSection
            role={role}
            data={{
              canManage: owner,
              files: 2,
              meta: { status: "connected", account: "Northlight Growth", user: "Malik Sannie", usedBy: ["Strategist"] },
            }}
          />
        ) : null}
        {section === "billing" ? <BillingSection /> : null}
        {section === "memory" ? <MemoryView facts={MEMORY} canEdit={role !== "viewer"} onRemove={() => undefined} /> : null}
        {section === "you" ? (
          <YouSection
            data={you}
            onTheme={(theme: ThemeChoice) => {
              saveTheme(theme);
              setYou((row) => ({ ...row, theme }));
            }}
            onNotice={async (key, on) => setYou((row) => ({ ...row, notifications: { ...row.notifications, [key]: on } }))}
            security={<AccountStory state={account} />}
            onSignOut={() => undefined}
          />
        ) : null}
      </SettingsLayout>
    </main>
  );
}
