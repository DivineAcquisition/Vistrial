"use client";

import { canWork } from "@/lib/roles";
import { useState } from "react";

import { GOOGLE_DATA, GoogleDataPanel, type GoogleDataView } from "@/components/connections/google-data";
import { CALENDAR_NOTES, CALENDARS } from "@/components/connections/integrations";
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
  google_analytics: { status: "connected", accountLabel: "dana@northpeak.agency", connectedAt: Date.UTC(2026, 10, 12), lastSyncAt: Date.UTC(2026, 10, 14, 9), lastSyncCode: "ok", agents: ["growth-architect"] },
  search_console: { status: "connected", accountLabel: "dana@northpeak.agency", connectedAt: Date.UTC(2026, 10, 12), lastSyncAt: Date.UTC(2026, 10, 14, 9), lastSyncCode: "ok", agents: ["growth-architect"] },
  google_ads: { status: "connected", accountLabel: "dana@northpeak.agency", connectedAt: Date.UTC(2026, 10, 12), lastSyncAt: Date.UTC(2026, 10, 14, 9), lastSyncCode: "ok", agents: ["growth-architect"] },
  business_profile: { status: "connected", accountLabel: "dana@northpeak.agency", connectedAt: Date.UTC(2026, 10, 12), lastSyncAt: Date.UTC(2026, 10, 14, 9), lastSyncCode: "awaiting_approval", agents: ["growth-architect"] },
  google_calendar: { status: "needsReconnect", accountLabel: "dana@northpeak.agency", connectedAt: Date.UTC(2026, 10, 2), lastSyncAt: Date.UTC(2026, 10, 9, 9), lastSyncCode: "token_rejected", agents: ["growth-architect"] },
};

// The agency's own site in Google Analytics, last 28 days. Sample figures.
const ANALYTICS: GoogleDataView = {
  noun: "property",
  canChoose: true,
  lastSyncCode: "ok",
  selected: { id: "properties/111", label: "Northpeak · northpeak.agency" },
  choices: [
    { id: "properties/111", label: "Northpeak · northpeak.agency" },
    { id: "properties/222", label: "Northpeak · Northpeak blog" },
  ],
  summary: {
    syncedAt: Date.UTC(2026, 10, 14, 9),
    data: {
      selectedId: "properties/111",
      from: "2026-10-17",
      to: "2026-11-13",
      totals: { sessions: 4812, users: 3940, keyEvents: 63 },
      days: [{ date: "2026-11-13", sessions: 180, users: 150, keyEvents: 3 }],
      sources: [
        { name: "google / organic", sessions: 2104, keyEvents: 31 },
        { name: "(direct) / (none)", sessions: 1188, keyEvents: 14 },
        { name: "facebook / paid", sessions: 902, keyEvents: 11 },
        { name: "linkedin.com / referral", sessions: 311, keyEvents: 5 },
      ],
      pages: [
        { path: "/", sessions: 1990, keyEvents: 12 },
        { path: "/case-studies/dental-group-retainers", sessions: 720, keyEvents: 19 },
        { path: "/pricing", sessions: 610, keyEvents: 22 },
      ],
      events: [
        { name: "book_call", count: 41 },
        { name: "form_submit", count: 22 },
      ],
    },
  },
};

// The agency's site in Google Search, 28 days ending three days ago. Sample figures.
const SEARCH: GoogleDataView = {
  noun: "site",
  canChoose: true,
  lastSyncCode: "ok",
  selected: { id: "sc-domain:northpeak.agency", label: "northpeak.agency" },
  choices: [{ id: "sc-domain:northpeak.agency", label: "northpeak.agency" }],
  summary: {
    syncedAt: Date.UTC(2026, 10, 14, 9),
    data: {
      selectedId: "sc-domain:northpeak.agency",
      from: "2026-10-15",
      to: "2026-11-11",
      totals: { clicks: 1284, impressions: 41230, ctr: 0.0311, position: 14.2 },
      days: [],
      queries: [
        { name: "marketing agency for dentists", clicks: 212, impressions: 3120, ctr: 0.068, position: 4.1 },
        { name: "northpeak agency", clicks: 188, impressions: 402, ctr: 0.4677, position: 1.2 },
        { name: "dental practice facebook ads", clicks: 96, impressions: 5410, ctr: 0.0177, position: 11.8 },
      ],
      pages: [
        { name: "https://northpeak.agency/", clicks: 540, impressions: 12020, ctr: 0.0449, position: 9.4 },
        { name: "https://northpeak.agency/case-studies/dental-group-retainers", clicks: 301, impressions: 8800, ctr: 0.0342, position: 12.6 },
      ],
    },
  },
};

// The agency's own Google Ads, last 30 days. Sample figures.
const ADS: GoogleDataView = {
  noun: "account",
  canChoose: true,
  lastSyncCode: "ok",
  selected: { id: "1234567890", label: "Northpeak Agency (123-456-7890)" },
  choices: [{ id: "1234567890", label: "Northpeak Agency (123-456-7890)" }],
  summary: {
    syncedAt: Date.UTC(2026, 10, 14, 9),
    data: {
      selectedId: "1234567890",
      currency: "USD",
      from: "2026-10-15",
      to: "2026-11-13",
      totals: { spend: 3842.5, impressions: 61200, clicks: 1904, conversions: 47, value: 28200, campaigns: 4, active: 3 },
      days: [],
      campaigns: [
        { id: "1", name: "Dentists, search, US", status: "enabled", type: "search", spend: 2210, impressions: 30100, clicks: 1180, conversions: 31, value: 18600 },
        { id: "2", name: "Brand terms", status: "enabled", type: "search", spend: 640.5, impressions: 9800, clicks: 512, conversions: 12, value: 7200 },
        { id: "3", name: "Retargeting, display", status: "paused", type: "display", spend: 992, impressions: 21300, clicks: 212, conversions: 4, value: 2400 },
      ],
      truncated: false,
    },
  },
};

// Business Profile before Google approves access: the card says so.
const PROFILE: GoogleDataView = { noun: "location", canChoose: true, lastSyncCode: "awaiting_approval", selected: null, choices: [], summary: null };

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
    lead: { contactRef: "con1", dealRef: "opp1", name: "Priya Shah" },
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
  { slug: "growth-architect", name: "Strategist" },
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
  const canEdit = canWork(role);
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
        canRefresh={canEdit}
        refreshable={[...CALENDARS, ...GOOGLE_DATA]}
        notes={CALENDAR_NOTES}
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
          refresh: async (key) =>
            setProviders((rows) => rows.map((row) => (row.key === key && row.connection ? { ...row, connection: { ...row.connection, lastSyncAt: Date.UTC(2026, 10, 11, 10, 30), lastSyncCode: "ok" } } : row))),
        }}
        extra={{
          card: (key) => {
            const view = key === "google_analytics" ? ANALYTICS : key === "search_console" ? SEARCH : key === "google_ads" ? ADS : key === "business_profile" ? PROFILE : null;
            return view ? <GoogleDataPanel provider={key} view={role === "owner" ? view : { ...view, canChoose: false }} onChoose={async () => undefined} /> : null;
          },
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
