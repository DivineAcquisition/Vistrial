"use client";

import { useState } from "react";

import { JourneySidebarView, SearchResults } from "@/components/shell/journey-sidebar";
import { OrganizationSwitcherView } from "@/components/shell/organization-switcher";
import type { ShellAccount, ShellOrganization } from "@/components/shell/shell-context";
import type { Id } from "../../../../convex/_generated/dataModel";
import { STORY_AGENTS, STORY_HITS, storyOverview } from "../journey-sidebar/fixtures";
import { StoryTheme } from "../story-theme";

const id = (value: string) => value as Id<"workspaces">;
const ACCOUNT = "acct1" as Id<"accounts">;

/** An agency owner with three businesses of her own. */
const OWNED: ShellOrganization[] = [
  { workspaceId: id("w1"), name: "Northlight Growth", role: "owner", accountId: ACCOUNT },
  { workspaceId: id("w2"), name: "Northlight Coaching", role: "owner", accountId: ACCOUNT },
  { workspaceId: id("w3"), name: "The Retainer Playbook", role: "owner", accountId: ACCOUNT },
];

/** Someone on her team: a different role in each organization they were given, and not the third. */
const GIVEN: ShellOrganization[] = [
  { workspaceId: id("w1"), name: "Northlight Growth", role: "admin", accountId: ACCOUNT },
  { workspaceId: id("w2"), name: "Northlight Coaching", role: "viewer", accountId: ACCOUNT },
];

const CLOSED = "Adding another organization is not switched on yet. Contact us and we will add it for you.";

function fixture(state: string): { organizations: ShellOrganization[]; account: ShellAccount } {
  const owner = state !== "member";
  return {
    organizations: state === "one" ? OWNED.slice(0, 1) : state === "member" ? GIVEN : OWNED,
    account: { accountId: ACCOUNT, name: "Northlight", owner, canAdd: owner && state !== "closed", addClosedReason: owner && state === "closed" ? CLOSED : null },
  };
}

/** The sidebar with the organization selector on top, fed by fixtures: one business, several, or a team member's view. */
export function OrganizationsStory({ state, theme }: { state: string; theme: string }) {
  const { organizations: initial, account } = fixture(state);
  const [organizations, setOrganizations] = useState(initial);
  const [current, setCurrent] = useState<string>(initial[0].workspaceId);
  const open = organizations.find((row) => row.workspaceId === current) ?? organizations[0];
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <StoryTheme theme={theme} />
      <div className="flex h-dvh w-full flex-col border-border md:w-72 md:border-r">
        <JourneySidebarView
          agents={STORY_AGENTS}
          data={{ overview: { ...storyOverview("busy")!, workspaceName: open.name }, credits: { on: true, balanceCents: 18340 } }}
          pathname="/app"
          scope={
            <OrganizationSwitcherView
              name={open.name}
              current={current}
              organizations={organizations}
              account={account}
              onSwitch={setCurrent}
              onAdd={async (name) => {
                if (organizations.some((row) => row.name.toLowerCase() === name.trim().toLowerCase())) return "You already have an organization with that name.";
                const added: ShellOrganization = { workspaceId: id(`w${organizations.length + 1}`), name: name.trim(), role: "owner", accountId: ACCOUNT };
                setOrganizations((rows) => [...rows, added]);
                setCurrent(added.workspaceId);
                return null;
              }}
            />
          }
          renderSearch={(text, close) => (
            <SearchResults text={text} hits={STORY_HITS.filter((hit) => hit.title.toLowerCase().includes(text.trim().toLowerCase()))} close={close} />
          )}
        />
      </div>
    </div>
  );
}
