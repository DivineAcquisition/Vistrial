"use client";

import { CalendarIcon, Search, Store, type LucideIcon } from "@/components/icons";
import { useState } from "react";

import { PlatformLogo } from "@/components/marketing/platform-logo";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type IntegrationView = {
  key: string;
  group: "google" | "calendar" | "notes";
  name: string;
  kind: string;
  reads: string;
  never: string;
  readiness: "not_set_up" | "not_built" | "ready";
  connection: {
    status: "connected" | "needsReconnect";
    accountLabel: string;
    connectedAt: number;
    lastSyncAt: number | null;
    lastSyncCode: string | null;
    agents: string[];
  } | null;
};

export type IntegrationsActions = {
  connect: (provider: string) => Promise<void>;
  disconnect: (provider: string) => Promise<void>;
  /** Reads a connection again now. Only offered for the providers in `refreshable`. */
  refresh?: (provider: string) => Promise<void>;
};

const GROUPS: { key: IntegrationView["group"]; title: string; words: string }[] = [
  { key: "google", title: "Google", words: "Your ads, site traffic, search results and business listing." },
  { key: "calendar", title: "Calendar", words: "Booked calls, and who cancelled or did not show where the calendar records it." },
  { key: "notes", title: "AI note takers", words: "Call transcripts and summaries from the tool that records your calls." },
];

const LOGO: Record<string, string> = {
  google_ads: "google-ads",
  google_analytics: "google-analytics",
  google_calendar: "google-calendar",
  fathom: "fathom",
  fireflies: "fireflies",
};
const ICON: Record<string, LucideIcon> = { search_console: Search, business_profile: Store, calendly: CalendarIcon };

/** What came back from a provider's sign-in, in plain words. */
export const OUTCOME_WORDS: Record<string, { tone: "good" | "warning"; words: (name: string) => string }> = {
  connected: { tone: "good", words: (name) => `${name} is connected. Vistrial reads it; nothing there is changed.` },
  cancelled: { tone: "warning", words: (name) => `${name} was not connected: the sign-in was cancelled.` },
  expired: { tone: "warning", words: () => "That sign-in took too long or was already used. Start it again from here." },
  missing_permission: { tone: "warning", words: (name) => `${name} was not connected: the permission Vistrial needs to read it was not given. Nothing was kept.` },
  not_set_up: { tone: "warning", words: (name) => `${name} is not set up on Vistrial yet.` },
  failed: { tone: "warning", words: (name) => `${name} could not be connected just now. Nothing was kept. Try again in a moment.` },
};

function Mark({ provider }: { provider: IntegrationView }) {
  const Icon = ICON[provider.key];
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
      {LOGO[provider.key] ? <PlatformLogo id={LOGO[provider.key]} size={18} decorative /> : Icon ? <Icon aria-hidden className="size-4 text-muted-foreground" /> : null}
    </span>
  );
}

function badge(provider: IntegrationView): { label: string; tone: "good" | "warning" | "neutral" } {
  if (provider.connection?.status === "connected") return { label: "Connected", tone: "good" };
  if (provider.connection) return { label: "Reconnect needed", tone: "warning" };
  if (provider.readiness === "not_set_up") return { label: "Not set up yet", tone: "neutral" };
  if (provider.readiness === "not_built") return { label: "Not built yet", tone: "neutral" };
  return { label: "Not connected", tone: "neutral" };
}

function when(at: number) {
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Why the last read did not finish, in plain words. */
export const SYNC_WORDS: Record<string, string> = {
  token_rejected: "signed Vistrial out",
  permission_missing: "refused the read",
  rate_limited: "asked Vistrial to slow down",
  provider_down: "was not answering",
  connection_failed: "could not be reached",
};

function ProviderCard({
  provider,
  canManage,
  canRefresh,
  note,
  actions,
}: {
  provider: IntegrationView;
  canManage: boolean;
  /** This connection can be read again on request, and this person may ask for it. */
  canRefresh: boolean;
  /** One short line shown while connected. */
  note?: string;
  actions: IntegrationsActions;
}) {
  const [busy, setBusy] = useState<"connect" | "refresh" | "disconnect" | null>(null);
  const status = badge(provider);
  const connection = provider.connection;
  const run = async (what: "connect" | "refresh" | "disconnect", work: () => Promise<void>) => {
    setBusy(what);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  };
  const failed = connection?.lastSyncCode && connection.lastSyncCode !== "ok" ? (SYNC_WORDS[connection.lastSyncCode] ?? "did not finish the read") : null;
  return (
    <article
      aria-label={provider.name}
      className={cn("grid content-start gap-3 rounded-2xl border border-border bg-card p-4", !connection && provider.readiness !== "ready" && "bg-card/60")}
    >
      <header className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-3">
          <Mark provider={provider} />
          <span className="font-medium text-card-foreground">{provider.name}</span>
        </span>
        <StatusBadge label={status.label} tone={status.tone} className="shrink-0 [&_span]:normal-case" />
      </header>

      <p className="text-sm text-muted-foreground">{provider.reads}</p>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-sm">
        {connection ? (
          <>
            <p className="min-w-0 text-muted-foreground">
              {connection.status === "connected" ? "Connected as " : "Was connected as "}
              <span className="break-all text-foreground">{connection.accountLabel}</span>.{" "}
              {connection.lastSyncAt
                ? failed
                  ? `Last tried ${when(connection.lastSyncAt)}: ${provider.name} ${failed}.`
                  : `Last read ${when(connection.lastSyncAt)}.`
                : "Not read yet."}
              {note && connection.status === "connected" ? ` ${note}` : ""}
            </p>
            <span className="flex items-center gap-2">
              {canRefresh && connection.status === "connected" && actions.refresh ? (
                <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("refresh", () => actions.refresh!(provider.key))}>
                  {busy === "refresh" ? "Reading" : "Refresh"}
                </Button>
              ) : null}
              {canManage && connection.status === "needsReconnect" ? (
                <Button type="button" size="sm" disabled={busy !== null || provider.readiness !== "ready"} onClick={() => run("connect", () => actions.connect(provider.key))}>
                  Reconnect
                </Button>
              ) : null}
              {canManage ? (
                <ConfirmDialog
                  trigger={
                    <Button type="button" size="sm" variant="outline" disabled={busy !== null}>
                      Disconnect
                    </Button>
                  }
                  title={`Disconnect ${provider.name}?`}
                  description={`Vistrial deletes its access and everything it read from ${provider.name}, straight away. Nothing in ${provider.name} changes.`}
                  confirmLabel="Disconnect"
                  onConfirm={() => run("disconnect", () => actions.disconnect(provider.key))}
                />
              ) : null}
            </span>
          </>
        ) : provider.readiness === "not_set_up" ? (
          <p className="text-muted-foreground">Not available yet. There is nothing for you to do.</p>
        ) : provider.readiness === "not_built" ? (
          <p className="text-muted-foreground">Not available yet.</p>
        ) : canManage ? (
          <>
            <p className="text-muted-foreground">Read-only.</p>
            <Button type="button" size="sm" disabled={busy !== null} onClick={() => run("connect", () => actions.connect(provider.key))}>
              Connect
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">A workspace Owner can connect this.</p>
        )}
      </footer>
    </article>
  );
}

/**
 * The other accounts a workspace can connect, in three groups. Each card is kept simple: what Vistrial
 * reads in one line, its status, when it was last read, and the buttons. Figures read through a connection
 * are not shown here; they belong to the screens that use them.
 */
export function IntegrationsView({
  providers,
  canManage,
  canRefresh = false,
  refreshable = [],
  notes = {},
  returned,
  actions,
  extra,
}: {
  providers: IntegrationView[];
  canManage: boolean;
  /** Owners and Managers may ask for a fresh read. */
  canRefresh?: boolean;
  /** The providers that can be read again on request. */
  refreshable?: string[];
  /** One short line for a connected provider's card, by key. */
  notes?: Record<string, string>;
  /** What a sign-in came back with: the provider and the outcome. */
  returned?: { provider: string | null; outcome: string } | null;
  actions: IntegrationsActions;
  /** More to show after a group's cards, by group. */
  extra?: { group?: Partial<Record<IntegrationView["group"], React.ReactNode>> };
}) {
  const outcome = returned ? OUTCOME_WORDS[returned.outcome] : null;
  const returnedName = providers.find((row) => row.key === returned?.provider)?.name ?? "That account";
  return (
    <div className="grid gap-8">
      {outcome ? (
        <p
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            outcome.tone === "good" ? "border-success/30 bg-success/10 text-foreground" : "border-warning/30 bg-warning/10 text-foreground",
          )}
        >
          {outcome.words(returnedName)}
        </p>
      ) : null}
      {GROUPS.map((group) => {
        const rows = providers.filter((row) => row.group === group.key);
        if (rows.length === 0) return null;
        return (
          <section key={group.key} className="grid gap-3" aria-label={group.title}>
            <div className="grid gap-0.5">
              <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{group.title}</h2>
              <p className="text-sm text-muted-foreground">{group.words}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((row) => (
                <ProviderCard key={row.key} provider={row} canManage={canManage} canRefresh={canRefresh && refreshable.includes(row.key)} note={notes[row.key]} actions={actions} />
              ))}
            </div>
            {extra?.group?.[group.key]}
          </section>
        );
      })}
    </div>
  );
}
