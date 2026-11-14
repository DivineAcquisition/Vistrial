"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AnalyticsSnapshot } from "../../../convex/lib/integrations/google/analytics";
import { fmtMoney, type AdsSnapshot } from "../../../convex/lib/integrations/google/googleAds";
import type { SearchRow, SearchSnapshot } from "../../../convex/lib/integrations/google/searchConsole";

export type GoogleDataView = NonNullable<FunctionReturnType<typeof api.googleData.view>>;

/** The Google data connections read here, with a chooser and totals on their cards. */
export const GOOGLE_DATA = ["google_analytics", "search_console", "google_ads"];

const n = (value: number) => value.toLocaleString("en-US");

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-border bg-background/60 p-2.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-heading text-base text-foreground tabular-nums">{value}</span>
      {note ? <span className="text-[10px] text-muted-foreground">{note}</span> : null}
    </div>
  );
}

function AnalyticsTotals({ data }: { data: AnalyticsSnapshot }) {
  if (!data.days.length) return <p className="text-sm text-muted-foreground">No visits recorded in the last 28 days.</p>;
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        {data.from} to {data.to}, as Google Analytics reports it.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Figure label="Sessions" value={n(data.totals.sessions)} />
        <Figure label="Users" value={n(data.totals.users)} note="daily users added up" />
        <Figure label="Key events" value={n(data.totals.keyEvents)} />
      </div>
      {data.sources.length ? (
        <div className="grid gap-1">
          <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Top sources</h4>
          <ul className="grid gap-0.5 text-sm">
            {data.sources.slice(0, 5).map((row) => (
              <li key={row.name} className="flex min-w-0 justify-between gap-3">
                <span className="truncate text-foreground">{row.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{n(row.sessions)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.pages.length ? (
        <div className="grid gap-1">
          <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Top landing pages</h4>
          <ul className="grid gap-0.5 text-sm">
            {data.pages.slice(0, 5).map((row) => (
              <li key={row.path} className="flex min-w-0 justify-between gap-3">
                <span className="truncate text-foreground">{row.path}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{n(row.sessions)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.events.length ? (
        <p className="text-xs text-muted-foreground">
          Key events:{" "}
          {data.events
            .slice(0, 5)
            .map((row) => `${row.name} (${n(row.count)})`)
            .join(", ")}
          .
        </p>
      ) : null}
    </div>
  );
}

const percent = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);

function SearchList({ title, rows }: { title: string; rows: SearchRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="grid gap-1">
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h4>
      <ul className="grid gap-0.5 text-sm">
        {rows.slice(0, 5).map((row) => (
          <li key={row.name} className="flex min-w-0 justify-between gap-3">
            <span className="truncate text-foreground">{row.name}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {n(row.clicks)} clicks · {n(row.impressions)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchTotals({ data }: { data: SearchSnapshot }) {
  if (!data.totals.impressions)
    return (
      <p className="text-sm text-muted-foreground">
        No search impressions from {data.from} to {data.to}.
      </p>
    );
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        {data.from} to {data.to}, as Search Console reports it. Its figures arrive 2 to 3 days late, and it lists top rows, not every search.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Clicks" value={n(data.totals.clicks)} />
        <Figure label="Impressions" value={n(data.totals.impressions)} />
        <Figure label="Click rate" value={percent(data.totals.ctr)} />
        <Figure label="Avg. position" value={data.totals.position === null ? "n/a" : String(data.totals.position)} />
      </div>
      <SearchList title="Top queries" rows={data.queries} />
      <SearchList title="Top pages" rows={data.pages} />
    </div>
  );
}

function AdsTotals({ data }: { data: AdsSnapshot }) {
  if (!data.campaigns.length) return <p className="text-sm text-muted-foreground">No campaign activity in the last 30 days.</p>;
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        {data.from} to {data.to}, as Google Ads reports it. {data.totals.campaigns} campaigns, {data.totals.active} running.
        {data.truncated ? " More rows than Vistrial reads; these are the first." : ""}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Spend" value={fmtMoney(data.totals.spend, data.currency)} />
        <Figure label="Clicks" value={n(data.totals.clicks)} />
        <Figure label="Conversions" value={n(data.totals.conversions)} />
        <Figure label="Conv. value" value={fmtMoney(data.totals.value, data.currency)} />
      </div>
      <div className="grid gap-1">
        <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Campaigns by spend</h4>
        <ul className="grid gap-0.5 text-sm">
          {data.campaigns.slice(0, 5).map((row) => (
            <li key={row.id} className="flex min-w-0 justify-between gap-3">
              <span className="truncate text-foreground">
                {row.name} <span className="text-muted-foreground">· {row.status}</span>
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {fmtMoney(row.spend, data.currency)} · {n(row.conversions)} conv.
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The chooser and the last totals for one Google data connection. */
export function GoogleDataPanel({ provider, view, onChoose }: { provider: string; view: GoogleDataView; onChoose: (choiceId: string) => Promise<unknown> }) {
  const [pick, setPick] = useState(view.selected?.id ?? "");
  const [busy, setBusy] = useState(false);
  const changing = !view.selected || pick !== view.selected.id;
  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm" data-google-data={provider}>
      {view.choices.length === 0 ? (
        <p className="text-muted-foreground">No {view.noun} found for this Google account yet. Refresh after you are given access to one.</p>
      ) : view.canChoose ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="grid min-w-0 flex-1 gap-1">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Reads this {view.noun}</span>
            <select value={pick} onChange={(event) => setPick(event.target.value)} className="h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground">
              {!view.selected ? <option value="">Choose a {view.noun}</option> : null}
              {view.choices.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          {changing && pick ? (
            <Button
              type="button"
              size="sm"
              className="self-end"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onChoose(pick);
                } catch (error) {
                  showError(error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Use this {view.noun}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">{view.selected ? `Reads ${view.selected.label}.` : `An Owner or Admin chooses which ${view.noun} it reads.`}</p>
      )}
      {view.summary && provider === "google_analytics" ? (
        <AnalyticsTotals data={view.summary.data as AnalyticsSnapshot} />
      ) : view.summary && provider === "search_console" ? (
        <SearchTotals data={view.summary.data as SearchSnapshot} />
      ) : view.summary && provider === "google_ads" ? (
        <AdsTotals data={view.summary.data as AdsSnapshot} />
      ) : view.selected ? (
        <p className="text-muted-foreground">Reading the totals now.</p>
      ) : null}
    </div>
  );
}

/** Feeds one card's panel from Convex. */
export function GoogleDataCard({ workspaceId, provider }: { workspaceId: Id<"workspaces">; provider: string }) {
  const view = useQuery(api.googleData.view, { workspaceId, provider });
  const choose = useMutation(api.googleData.choose);
  if (!view) return null;
  return <GoogleDataPanel provider={provider} view={view} onChoose={(choiceId) => choose({ workspaceId, provider, choiceId })} />;
}
