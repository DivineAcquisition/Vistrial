"use client";

import { CalendarIcon, Check, Search, Store, X, type LucideIcon } from "@/components/icons";
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

function day(at: number) {
  return new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function ProviderCard({
  provider,
  canManage,
  actions,
  children,
}: {
  provider: IntegrationView;
  canManage: boolean;
  actions: IntegrationsActions;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const status = badge(provider);
  const connection = provider.connection;
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };
  return (
    <article
      aria-label={provider.name}
      className={cn("grid content-start gap-3 rounded-2xl border border-border bg-card p-4", !connection && provider.readiness !== "ready" && "bg-card/60")}
    >
      <header className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-3">
          <Mark provider={provider} />
          <span className="grid min-w-0">
            <span className="font-medium text-card-foreground">{provider.name}</span>
            <span className="text-xs text-muted-foreground">{provider.kind}</span>
          </span>
        </span>
        <StatusBadge label={status.label} tone={status.tone} className="shrink-0 [&_span]:normal-case" />
      </header>

      <dl className="grid gap-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="flex h-fit shrink-0 items-center gap-1 text-foreground">
            <Check aria-hidden className="size-3.5 text-success" /> Reads
          </dt>
          <dd className="text-muted-foreground">{provider.reads}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="flex h-fit shrink-0 items-center gap-1 text-foreground">
            <X aria-hidden className="size-3.5 text-muted-foreground" /> Never
          </dt>
          <dd className="text-muted-foreground">{provider.never}</dd>
        </div>
      </dl>

      {children}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-sm">
        {connection ? (
          <>
            <p className="min-w-0 text-muted-foreground">
              {connection.status === "connected" ? "Connected as " : "Was connected as "}
              <span className="break-all text-foreground">{connection.accountLabel}</span>, {day(connection.connectedAt)}.
              {connection.status === "needsReconnect" ? ` ${provider.name} signed Vistrial out. Reconnect to keep reading.` : ""}
            </p>
            {canManage ? (
              <span className="flex items-center gap-2">
                {connection.status === "needsReconnect" ? (
                  <Button type="button" size="sm" disabled={busy || provider.readiness !== "ready"} onClick={() => run(() => actions.connect(provider.key))}>
                    Reconnect
                  </Button>
                ) : null}
                <ConfirmDialog
                  trigger={
                    <Button type="button" size="sm" variant="outline" disabled={busy}>
                      Disconnect
                    </Button>
                  }
                  title={`Disconnect ${provider.name}?`}
                  description={`Vistrial deletes its access and everything it read from ${provider.name}, straight away. Nothing in ${provider.name} changes.`}
                  confirmLabel="Disconnect"
                  onConfirm={() => run(() => actions.disconnect(provider.key))}
                />
              </span>
            ) : null}
          </>
        ) : provider.readiness === "not_set_up" ? (
          <p className="text-muted-foreground">Vistrial has not finished setting this up. There is nothing for you to do yet.</p>
        ) : provider.readiness === "not_built" ? (
          <p className="text-muted-foreground">Reading from {provider.name} is not built yet.</p>
        ) : canManage ? (
          <>
            <p className="text-muted-foreground">Read-only. You can disconnect at any time.</p>
            <Button type="button" size="sm" disabled={busy} onClick={() => run(() => actions.connect(provider.key))}>
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
 * The other accounts a workspace can connect, in three groups. Each provider says what Vistrial reads and
 * never does, and shows "Not set up yet" until Vistrial has that provider's settings.
 */
export function IntegrationsView({
  providers,
  canManage,
  returned,
  actions,
  extra,
}: {
  providers: IntegrationView[];
  canManage: boolean;
  /** What a sign-in came back with: the provider and the outcome. */
  returned?: { provider: string | null; outcome: string } | null;
  actions: IntegrationsActions;
  /** More to show under a provider's card, by key, or after a group's cards, by group. */
  extra?: { card?: Record<string, React.ReactNode>; group?: Partial<Record<IntegrationView["group"], React.ReactNode>> };
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
                <ProviderCard key={row.key} provider={row} canManage={canManage} actions={actions}>
                  {extra?.card?.[row.key]}
                </ProviderCard>
              ))}
            </div>
            {extra?.group?.[group.key]}
          </section>
        );
      })}
    </div>
  );
}
