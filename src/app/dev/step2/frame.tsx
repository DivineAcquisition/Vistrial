"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, useState, type ReactNode } from "react";

import { ClientPickerView } from "@/components/shell/client-picker";
import { JourneySidebarView, SearchResults } from "@/components/shell/journey-sidebar";
import { OrganizationSwitcherView } from "@/components/shell/organization-switcher";
import { ShellProvider, type ScopeChoice, type ShellClient, type ShellOrganization, type WorkspaceShell } from "@/components/shell/shell-context";
import type { Role } from "@/lib/roles";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STORY_AGENTS, STORY_HITS, storyOverview } from "../journey-sidebar/fixtures";
import { ChatListView } from "@/components/chat/chat-library";
import { ChatPanelProvider } from "@/components/chat/side-panel";
import { StoryTheme } from "../story-theme";

/** The sample account every step 2 story uses: an agency, Northlight Growth, with business and person clients. */
export const ORGANIZATION = "Northlight Growth";
export const STORY_ORGANIZATIONS: ShellOrganization[] = [
  { workspaceId: "w1" as Id<"workspaces">, name: ORGANIZATION, role: "owner", accountId: "a1" as Id<"accounts"> },
  { workspaceId: "w2" as Id<"workspaces">, name: "Northlight Coaching", role: "owner", accountId: "a1" as Id<"accounts"> },
];
export const STORY_CLIENTS: ShellClient[] = [
  { id: "c1" as Id<"clients">, name: "Aster Coaching", type: "business", line: "Executive coaching" },
  { id: "c2" as Id<"clients">, name: "Harbor Dental Group", type: "business", line: "Multi-location dental practice" },
  { id: "c3" as Id<"clients">, name: "Ledgerline CFO", type: "business", line: "Fractional CFO for agencies" },
  { id: "c4" as Id<"clients">, name: "Dana Reyes", type: "person", line: "Leave her job and coach full time by June" },
];

/** The organization selector with the client picker under it, as the sidebar shows them, fed by the sample account. */
export function StoryScope({ role = "owner", initial = "all" }: { role?: Role; initial?: ScopeChoice }) {
  const [choice, setChoice] = useState<ScopeChoice>(initial);
  const manage = role === "owner" || role === "admin";
  const clients = manage ? STORY_CLIENTS : STORY_CLIENTS.filter((row) => row.id === "c1" || row.id === "c4");
  return (
    <>
      <OrganizationSwitcherView
        name={ORGANIZATION}
        current="w1"
        organizations={role === "owner" ? STORY_ORGANIZATIONS : STORY_ORGANIZATIONS.slice(0, 1).map((row) => ({ ...row, role }))}
        account={{ accountId: "a1" as Id<"accounts">, name: "Northlight", owner: role === "owner", canAdd: role === "owner", addClosedReason: null }}
        onSwitch={() => undefined}
        onAdd={async () => null}
      />
      <ClientPickerView organizationName={ORGANIZATION} clients={clients} ownWork canManage={manage} choice={choice} onChoose={setChoice} />
    </>
  );
}

/** The newest chats, as the sidebar's Library > Chats dropdown shows them. */
export const STORY_CHATS = [
  { id: "i7" as Id<"intakes">, title: "Why did Aster's booked calls stop turning into clients?", client: "Aster Coaching" },
  { id: "i6" as Id<"intakes">, title: "What do fractional CFO firms charge agencies?", client: "Ledgerline CFO" },
  { id: "i5" as Id<"intakes">, title: "Is our growth retainer priced right?", client: null },
];

/** A step 2 screen inside the app's frame: the sidebar on the left (hidden on a phone, as in the app) and the page. */
export function Step2Frame({ theme, role = "owner", path, state = "busy", children, right }: { theme: string; role?: Role; path: string; state?: string; children: ReactNode; /** The column on the right: the side chat panel, in its stories. */ right?: ReactNode }) {
  const client = useMemo(() => new ConvexReactClient("https://story-fixture-123.convex.cloud"), []);
  const shell: WorkspaceShell = { workspaceId: "w1" as Id<"workspaces">, role, setupDone: true, agents: STORY_AGENTS, clients: STORY_CLIENTS, ownWork: true, choice: "all" };
  return (
    <ConvexProvider client={client}>
      <ShellProvider value={shell}>
        <ChatPanelProvider initial={{ open: Boolean(right) }}>
        <StoryTheme theme={theme} />
        <div className="flex min-h-dvh min-w-0 overflow-x-clip bg-background text-foreground">
          <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 self-start overflow-y-auto overscroll-contain border-r border-border md:flex md:flex-col">
            <JourneySidebarView
              agents={STORY_AGENTS}
              data={{ overview: storyOverview(role === "viewer" ? "rep" : state), credits: { on: true, balanceCents: 11840 } }}
              pathname={path}
              scope={<StoryScope role={role} />}
              renderSearch={(text, close) => <SearchResults text={text} hits={STORY_HITS} close={close} />}
              chatList={<ChatListView rows={STORY_CHATS} />}
            />
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
          {right}
        </div>
        </ChatPanelProvider>
      </ShellProvider>
    </ConvexProvider>
  );
}
