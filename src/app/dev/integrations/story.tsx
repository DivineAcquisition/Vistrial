"use client";

import { useState } from "react";

import { IntegrationsView, type IntegrationView } from "@/components/connections/integrations-view";
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
      />
    </main>
  );
}
