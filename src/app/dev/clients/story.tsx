"use client";

import { useState } from "react";

import { ClientsView, type AccessRow, type ClientDetail, type ClientDraft } from "@/components/clients/clients-view";
import { ClientPickerView } from "@/components/shell/client-picker";
import { JourneySidebarView, SearchResults } from "@/components/shell/journey-sidebar";
import { OrganizationSwitcherView } from "@/components/shell/organization-switcher";
import type { ScopeChoice, ShellClient, ShellOrganization } from "@/components/shell/shell-context";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STORY_AGENTS, STORY_HITS, storyOverview } from "../journey-sidebar/fixtures";
import { StoryTheme } from "../story-theme";

const ORGANIZATION = "Northlight Growth";

/** An agency's clients: three businesses it runs ads for, and two people its founder coaches. */
const CLIENTS: ClientDetail[] = [
  {
    id: "c1", type: "business", name: "Aster Coaching", status: "active", line: "Executive coaching for new directors",
    business: { website: "https://astercoaching.com", industry: "Executive coaching for new directors", offer: "A twelve week leadership program, $4,800", audience: "First-time directors at tech companies", geography: "US and Canada, online", notes: "Retainer since March. Calls on Tuesdays with Priya." },
    person: null,
  },
  {
    id: "c2", type: "business", name: "Lumen Course Co", status: "active", line: "Online courses for freelance designers",
    business: { website: "https://lumencourses.com", industry: "Online courses for freelance designers", offer: "Pricing for Designers, $349", audience: "Freelance brand designers, two to five years in", geography: "Worldwide", notes: "" },
    person: null,
  },
  {
    id: "c3", type: "business", name: "Harbor Consulting", status: "active", line: "Fractional CFO for agencies",
    business: { website: "", industry: "Fractional CFO for agencies", offer: "", audience: "", geography: "", notes: "" },
    person: null,
  },
  {
    id: "c4", type: "person", name: "Dana Reyes", status: "active", line: "Leave her job and coach full time by June",
    business: null,
    person: { goals: "Leave her job and coach full time by June", currentState: "Three paying clients, no waitlist, posts twice a week", notes: "Wants a signature offer before raising prices." },
  },
  { id: "c5", type: "person", name: "Marcus Bell", status: "active", line: "First $10k month from his newsletter", business: null, person: { goals: "First $10k month from his newsletter", currentState: "2,100 subscribers, one sponsor", notes: "" } },
];
const ARCHIVED: ClientDetail[] = [{ id: "c9", type: "business", name: "Quill Agency", status: "archived", line: "", business: { website: "", industry: "", offer: "", audience: "", geography: "", notes: "" }, person: null }];

const ACCESS: AccessRow[] = [
  { memberId: "m1", name: "Nora Sannie", role: "owner", always: true, assigned: true },
  { memberId: "m2", name: "Dana Ortiz", role: "admin", always: true, assigned: true },
  { memberId: "m3", name: "Jordan Lee", role: "member", always: false, assigned: true },
  { memberId: "m4", name: "Priya Nair", role: "member", always: false, assigned: false },
  { memberId: "m5", name: "Sam Patel", role: "viewer", always: false, assigned: false },
];

const ORGANIZATIONS: ShellOrganization[] = [
  { workspaceId: "w1" as Id<"workspaces">, name: ORGANIZATION, role: "owner", accountId: "a1" as Id<"accounts"> },
  { workspaceId: "w2" as Id<"workspaces">, name: "Northlight Coaching", role: "owner", accountId: "a1" as Id<"accounts"> },
];

const asPicker = (rows: ClientDetail[]): ShellClient[] => rows.map((row) => ({ id: row.id as Id<"clients">, name: row.name, type: row.type, line: row.line }));

export function ClientsStory({ view, state, open, theme }: { view: string; state: string; open: string; theme: string }) {
  const manage = state !== "member";
  // A Member sees only the clients they were given.
  const [clients, setClients] = useState<ClientDetail[]>(state === "empty" ? [] : manage ? CLIENTS : CLIENTS.filter((row) => row.id === "c1" || row.id === "c4"));
  const [access, setAccess] = useState(ACCESS);
  const [selected, setSelected] = useState<string | null>(open || null);
  const [choice, setChoice] = useState<ScopeChoice>(view === "sidebar" && open ? (open as ScopeChoice) : "all");
  const detail = [...clients, ...ARCHIVED].find((row) => row.id === selected) ?? null;

  if (view === "sidebar") {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <StoryTheme theme={theme} />
        <div className="flex h-dvh w-full flex-col border-border md:w-72 md:border-r">
          <JourneySidebarView
            agents={STORY_AGENTS}
            data={{ overview: { ...storyOverview("busy")!, workspaceName: ORGANIZATION }, credits: { on: true, balanceCents: 18340 } }}
            pathname="/app"
            scope={
              <>
                <OrganizationSwitcherView name={ORGANIZATION} current="w1" organizations={ORGANIZATIONS} account={{ accountId: "a1" as Id<"accounts">, name: "Northlight", owner: manage, canAdd: manage, addClosedReason: null }} onSwitch={() => undefined} onAdd={async () => null} />
                <ClientPickerView organizationName={ORGANIZATION} clients={asPicker(clients)} ownWork={state !== "member"} canManage={manage} choice={choice} onChoose={setChoice} />
              </>
            }
            renderSearch={(text, close) => <SearchResults text={text} hits={STORY_HITS.filter((hit) => hit.title.toLowerCase().includes(text.trim().toLowerCase()))} close={close} />}
          />
        </div>
      </div>
    );
  }

  const apply = (id: string, draft: ClientDraft) =>
    setClients((rows) => rows.map((row) => (row.id === id ? { ...row, name: draft.name, business: row.type === "business" ? draft.business : null, person: row.type === "person" ? draft.person : null, line: row.type === "business" ? draft.business.industry : draft.person.goals } : row)));
  return (
    <div className="min-h-dvh bg-background px-4 py-6 text-foreground md:px-8">
      <StoryTheme theme={theme} />
      <ClientsView
        organizationName={ORGANIZATION}
        canManage={manage}
        clients={clients}
        archived={manage && state !== "empty" ? ARCHIVED : []}
        selected={selected}
        detail={detail}
        access={manage && detail ? access : null}
        showing={choice}
        onSelect={setSelected}
        onShow={(id) => setChoice(id as ScopeChoice)}
        onCreate={async (draft) => {
          if (clients.some((row) => row.name.toLowerCase() === draft.name.trim().toLowerCase())) return "You already have a client with that name.";
          const id = `c${Date.now()}`;
          setClients((rows) => [...rows, { id, type: draft.type, name: draft.name.trim(), status: "active", line: draft.type === "business" ? draft.business.industry : draft.person.goals, business: draft.type === "business" ? draft.business : null, person: draft.type === "person" ? draft.person : null }]);
          setSelected(id);
          return null;
        }}
        onSave={async (id, draft) => {
          apply(id, draft);
          return null;
        }}
        onArchive={async (id, archived) => {
          setClients((rows) => rows.map((row) => (row.id === id ? { ...row, status: archived ? "archived" : "active" } : row)));
          return null;
        }}
        onAssign={async (_id, memberId, assigned) => {
          setAccess((rows) => rows.map((row) => (row.memberId === memberId ? { ...row, assigned } : row)));
          return null;
        }}
      />
    </div>
  );
}
