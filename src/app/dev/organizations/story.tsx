"use client";

import { useState } from "react";

import { JourneySidebarView, SearchResults } from "@/components/shell/journey-sidebar";
import { ArchivedBanner, OrganizationDataView, type ExportRow } from "@/components/settings/organization-data";
import { SharedReferencesView, type ReferenceItem, type ReferenceSource } from "@/components/settings/shared-references";
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
    organizations: state === "one" ? OWNED.slice(0, 1) : state === "member" ? GIVEN : state === "archived" ? [...OWNED.slice(0, 2), { ...OWNED[2], archived: true }] : OWNED,
    account: { accountId: ACCOUNT, name: "Northlight", owner, canAdd: owner && state !== "closed", addClosedReason: owner && state === "closed" ? CLOSED : null },
  };
}

const NOW = Date.UTC(2026, 10, 12, 15);
const DAY = 24 * 60 * 60 * 1000;
const EXPORTS: ExportRow[] = [
  { id: "e3", status: "building", createdAt: NOW, expiresAt: null, bytes: null, records: null, url: null },
  { id: "e2", status: "ready", createdAt: NOW - 2 * DAY, expiresAt: NOW + 5 * DAY, bytes: 1_840_000, records: 412, url: "#" },
  { id: "e1", status: "expired", createdAt: NOW - 30 * DAY, expiresAt: null, bytes: 1_210_000, records: 288, url: null },
];
const FEE = "Its $99 a month stops at your next renewal. There is no refund or credit for the part of this month already paid, and the credits it added stay until then.";

const REFERENCES: ReferenceItem[] = [
  { id: "r2", title: "Market report: executive coaches in the UK", kind: "Market report", fromName: "Northlight Growth", copiedAt: NOW - DAY, copiedByName: "Nora Lindqvist", chars: 18400, cut: false },
  { id: "r1", title: "Offer analysis: done-for-you lead generation retainer", kind: "Offer analysis", fromName: "The Retainer Playbook", copiedAt: NOW - 9 * DAY, copiedByName: "Nora Lindqvist", chars: 61000, cut: true },
];
const SOURCES: ReferenceSource[] = [
  {
    workspaceId: "w1",
    name: "Northlight Growth",
    archived: false,
    items: [
      { assetId: "a1", title: "Market report: executive coaches in the UK", kind: "Market report", createdAt: NOW - 12 * DAY, copied: true },
      { assetId: "a2", title: "Market report: B2B consultants, paid social", kind: "Market report", createdAt: NOW - 20 * DAY, copied: false },
      { assetId: "a3", title: "Offer analysis: growth audit", kind: "Offer analysis", createdAt: NOW - 31 * DAY, copied: false },
    ],
  },
  { workspaceId: "w3", name: "The Retainer Playbook", archived: true, items: [] },
];

/** Settings, Business: material copied in from other organizations. ?state=references|references-pick|references-read|references-member. */
function ReferencesStory({ state, theme }: { state: string; theme: string }) {
  const member = state === "references-member";
  return (
    <div className="min-h-dvh bg-background p-4 text-foreground sm:p-8">
      <StoryTheme theme={theme} />
      <div className="mx-auto grid max-w-3xl gap-4">
        <SharedReferencesView
          name="Northlight Coaching"
          data={{ items: REFERENCES, canCopy: !member, canRemove: !member, limit: 20 }}
          sources={state === "references-pick" ? SOURCES : null}
          body={state === "references-read" ? { id: "r2", text: "# Market report: executive coaches in the UK\n\nMost buyers find a coach through a referral or a podcast, not an ad. The three patterns that repeat across the sources are below.\n\n1. Programs are sold on a named outcome, not on hours.\n2. Price is shown only after a call.\n3. Proof is a client's own words, with their role." } : null}
          problem={null}
          busy={null}
          onOpenSources={() => {}}
          onCopy={() => {}}
          onRemove={() => {}}
          onRead={() => {}}
        />
      </div>
    </div>
  );
}

/** Settings, Business: export and archive, for an Owner. ?state=data|data-confirm|data-archived|data-first. */
function DataStory({ state, theme }: { state: string; theme: string }) {
  const archived = state === "data-archived";
  const first = state === "data-first";
  const [busy] = useState<null>(null);
  return (
    <div className="min-h-dvh bg-background p-4 text-foreground sm:p-8">
      <StoryTheme theme={theme} />
      <div className="mx-auto grid max-w-3xl gap-4">
        {archived ? <ArchivedBanner name="The Retainer Playbook" owner /> : null}
        <OrganizationDataView
          name={first ? "Northlight Growth" : "The Retainer Playbook"}
          state={{
            archived,
            archivedAt: archived ? NOW - 3 * DAY : null,
            isOwner: true,
            canArchive: !archived && !first,
            cannotArchiveReason: first ? "This is the account's first organization: the plan and the credit balance are held under it, so it cannot be archived. To stop the plan, use Billing." : null,
            feeWords: FEE,
            canRestore: archived,
            cannotRestoreReason: null,
          }}
          exports={first ? [] : archived ? EXPORTS.slice(1) : EXPORTS}
          problem={null}
          busy={busy}
          onExport={() => {}}
          onArchive={() => {}}
          onRestore={() => {}}
        />
      </div>
    </div>
  );
}

/** The sidebar with the organization selector on top, fed by fixtures: one business, several, or a team member's view. */
export function OrganizationsStory({ state, theme }: { state: string; theme: string }) {
  if (state.startsWith("data")) return <DataStory state={state} theme={theme} />;
  if (state.startsWith("references")) return <ReferencesStory state={state} theme={theme} />;
  return <SidebarStory state={state} theme={theme} />;
}

function SidebarStory({ state, theme }: { state: string; theme: string }) {
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
