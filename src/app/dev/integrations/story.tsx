"use client";

import { useState } from "react";

import { BookingsPanel, CALENDAR_PANELS, type BookingsView } from "@/components/connections/bookings-panel";
import { IntegrationsView, type IntegrationView } from "@/components/connections/integrations-view";
import { TranscriptsView, type TranscriptRow } from "@/components/connections/transcripts-view";
import { PROVIDERS, providerList, readiness } from "../../../../convex/lib/integrations/providers";
import { StoryTheme } from "../story-theme";

/** The settings each story state pretends the deployment has. Names only; the values are placeholders. */
const SETTINGS: Record<string, Record<string, string>> = {
  none: {},
  ready: { GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "x", CALENDLY_CLIENT_ID: "x", CALENDLY_CLIENT_SECRET: "x", CALENDLY_WEBHOOK_SIGNING_KEY: "x" },
};

const CONNECTED: Record<string, IntegrationView["connection"]> = {
  // A marketing agency's owner, connected to both calendars; Google has signed Vistrial out of Calendar.
  calendly: { status: "connected", accountLabel: "dana@northpeak.agency", connectedAt: Date.UTC(2026, 10, 9), lastSyncAt: Date.UTC(2026, 10, 11, 9), lastSyncCode: "ok", agents: ["growth-architect"] },
  google_calendar: { status: "needsReconnect", accountLabel: "dana@northpeak.agency", connectedAt: Date.UTC(2026, 10, 2), lastSyncAt: Date.UTC(2026, 10, 9, 9), lastSyncCode: "token_rejected", agents: ["growth-architect"] },
};

const WEEKS = ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"];
const BOOKINGS: Record<string, BookingsView> = {
  calendly: {
    provider: "calendly",
    syncedAt: Date.UTC(2026, 10, 11, 9),
    snapshot: {
      from: "2026-08-13",
      to: "2026-12-11",
      weeks: WEEKS.map((week, index) => ({ week, booked: [6, 9, 7, 11, 8, 12, 10, 5][index], cancelled: [1, 1, 0, 2, 1, 2, 1, 0][index], noShow: [1, 2, 1, 1, 0, 3, 1, 0][index] })),
      totals: { booked: 94, cancelled: 11, noShow: 12 },
      byType: [
        { name: "Discovery call", booked: 61, cancelled: 8, noShow: 10 },
        { name: "Strategy session", booked: 24, cancelled: 2, noShow: 2 },
        { name: "Client onboarding", booked: 9, cancelled: 1, noShow: 0 },
      ],
      noShowChecked: { checked: 30, of: 71 },
      truncated: false,
    },
  },
  google_calendar: {
    provider: "google_calendar",
    syncedAt: Date.UTC(2026, 10, 9, 9),
    snapshot: {
      from: "2026-08-11",
      to: "2026-12-09",
      weeks: WEEKS.slice(0, 7).map((week, index) => ({ week, booked: [8, 11, 9, 13, 10, 14, 12][index], cancelled: [1, 2, 0, 2, 1, 3, 1][index], declined: [0, 1, 0, 1, 0, 1, 0][index] })),
      totals: { booked: 118, cancelled: 14, declined: 5 },
      truncated: false,
    },
  },
};

// Calls a marketing agency recorded with prospects and clients.
const TRANSCRIPTS: TranscriptRow[] = [
  {
    id: "t1",
    title: "Discovery call, Harbor Dental group",
    tool: "Fathom",
    callDate: "2026-11-03",
    words: 6240,
    createdAt: Date.UTC(2026, 10, 4),
    agents: ["growth-architect"],
    opening: "Dana Ortiz: Thanks for making time. What made you book the call? Prospect: We spend about four thousand a month on Meta and cannot tell which ads bring retainers.",
  },
  {
    id: "t2",
    title: "Quarterly review, Lakeside Law",
    tool: "Zoom",
    callDate: "2026-10-28",
    words: 9815,
    createdAt: Date.UTC(2026, 9, 29),
    agents: [],
    opening: "Dana Ortiz: Before the numbers, what has changed on your side since July? Client: Two new partners, and intake is slower than it was.",
  },
];
const AGENTS = [
  { slug: "growth-architect", name: "Growth Architect" },
  { slug: "brand-studio", name: "Brand Studio" },
];

function build(state: string): IntegrationView[] {
  const env = SETTINGS[state === "none" ? "none" : "ready"];
  return providerList().map((row) => ({
    key: row.key,
    group: row.group,
    name: row.name,
    kind: row.kind,
    reads: row.reads,
    never: row.never,
    readiness: readiness(PROVIDERS[row.key], env),
    connection: state === "connected" || state === "returned" ? (CONNECTED[row.key] ?? null) : null,
  }));
}

/** The connections section as an agency's team sees it: nothing set up, ready to connect, connected, and just back from a sign-in. */
export function IntegrationsStory({ state, role, theme }: { state: string; role: string; theme: string }) {
  const [providers, setProviders] = useState(() => build(state));
  const [transcripts, setTranscripts] = useState(() => (state === "none" || state === "ready" ? [] : TRANSCRIPTS));
  const canEdit = role !== "rep";
  const card: Record<string, React.ReactNode> = {};
  for (const provider of providers) {
    const panel = CALENDAR_PANELS[provider.key];
    if (!panel || !provider.connection) continue;
    card[provider.key] = (
      <BookingsPanel
        bookings={BOOKINGS[provider.key] ?? null}
        third={panel.third}
        caveat={panel.caveat}
        canRefresh={canEdit && provider.connection.status === "connected"}
        lastCode={provider.connection.lastSyncCode}
        onRefresh={async () => undefined}
      />
    );
  }
  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4 sm:p-8">
      <StoryTheme theme={theme} />
      <div className="grid gap-1">
        <h1 className="font-heading text-xl text-foreground">More connections</h1>
        <p className="text-sm text-muted-foreground">
          Google, your calendar and your call notes. An Owner connects each one; Vistrial only reads, and disconnecting deletes what it read.
        </p>
      </div>
      <IntegrationsView
        providers={providers}
        canManage={role === "owner"}
        returned={state === "returned" ? { provider: "calendly", outcome: "connected" } : state === "cancelled" ? { provider: "google_calendar", outcome: "cancelled" } : null}
        actions={{
          connect: async (key) =>
            setProviders((rows) =>
              rows.map((row) =>
                row.key === key
                  ? { ...row, connection: { status: "connected", accountLabel: "dana@northpeak.agency", connectedAt: Date.UTC(2026, 10, 11), lastSyncAt: null, lastSyncCode: null, agents: ["growth-architect"] } }
                  : row,
              ),
            ),
          disconnect: async (key) => setProviders((rows) => rows.map((row) => (row.key === key ? { ...row, connection: null } : row))),
        }}
        extra={{
          card,
          group: {
            notes: (
              <TranscriptsView
                transcripts={transcripts}
                agents={AGENTS}
                canEdit={canEdit}
                canGrant={role === "owner"}
                highlight={state === "returned" ? null : "t1"}
                onAdd={async (input) => {
                  if (input.text.trim().length < 40) return "That is too short to be a call transcript.";
                  setTranscripts((rows) => [
                    { id: `t${rows.length + 10}`, title: input.title, tool: input.tool, callDate: input.callDate ?? null, words: input.text.split(/\s+/).length, createdAt: Date.UTC(2026, 10, 11), agents: ["growth-architect"], opening: input.text.slice(0, 200) },
                    ...rows,
                  ]);
                  return null;
                }}
                onRemove={async (id) => setTranscripts((rows) => rows.filter((row) => row.id !== id))}
                onGrant={(id, slug, granted) =>
                  setTranscripts((rows) => rows.map((row) => (row.id === id ? { ...row, agents: granted ? [...row.agents, slug] : row.agents.filter((agent) => agent !== slug) } : row)))
                }
              />
            ),
          },
        }}
      />
    </main>
  );
}
