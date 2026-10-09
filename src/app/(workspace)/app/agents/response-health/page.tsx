import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SentryQuality } from "@/app/(workspace)/app/agents/simulator/sentry-quality";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuthContext } from "@/lib/auth/session";
import { SEED_TEMPLATES } from "@/lib/config/seeds";
import { sentryStatus } from "@/lib/sentry/measures";
import { mapSentryQualityRow, SENTRY_QUALITY_COLUMNS } from "@/lib/sentry/quality-rows";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Response health" };

type HealthRow = {
  org_id: string;
  name: string;
  org_status: string;
  mode: string;
  last_sweep_at: string | null;
  last_error: string | null;
  watched: number;
  on_time: number;
  at_risk: number;
  missed: number;
  open_alerts: number;
  oldest_open_alert_at: string | null;
  first_touches: number;
  median_first_touch_seconds: number | null;
  within_window_percent: number | null;
  gaps: number;
  gaps_met_percent: number | null;
};

const STATE_TONE = { off: "neutral", watching: "good", paused: "warning", stopped: "critical" } as const;

async function loadHealth() {
  const db = (await createClient()) as unknown as SupabaseClient;
  const [{ data, error }, { data: quality }] = await Promise.all([
    db.rpc("sentry_response_health"),
    db.from("sentry_quality_runs").select(SENTRY_QUALITY_COLUMNS).order("created_at", { ascending: false }).limit(9),
  ]);
  const now = Date.now();
  return {
    error: error ? "Response health could not be read." : null,
    rows: ((data ?? []) as HealthRow[]).map((row) => ({
      ...row,
      status: sentryStatus({ mode: row.mode, lastSweepAt: row.last_sweep_at, lastError: row.last_error, now }),
      oldestMinutes: row.oldest_open_alert_at ? Math.round((now - Date.parse(row.oldest_open_alert_at)) / 60_000) : null,
    })),
    quality: ((quality ?? []) as Array<Record<string, unknown>>).map(mapSentryQualityRow),
  };
}

function minutes(seconds: number | null): string {
  if (seconds == null) return "—";
  const value = seconds / 60;
  return value < 60 ? `${Math.round(value)} min` : `${(value / 60).toFixed(1)} h`;
}

function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value)}%`;
}

function age(value: number | null): string {
  if (value == null) return "—";
  if (value < 60) return `${value} min`;
  if (value < 2880) return `${Math.round(value / 60)} h`;
  return `${Math.round(value / 1440)} d`;
}

/** Vistrial team only. One row per workspace the person may see; no lead names. */
export default async function ResponseHealthPage() {
  const ctx = await getAuthContext();
  if (!ctx.isStaff && !ctx.isPlatformAdmin) notFound();
  const { rows, quality, error } = await loadHealth();
  const stopped = rows.filter((row) => row.status.state === "stopped").length;
  const missed = rows.reduce((sum, row) => sum + Number(row.missed), 0);

  return (
    <PageFrame
      title="Response health"
      eyebrow="Vistrial team only"
      description="How quickly each workspace reaches its leads, what Sentry is waiting on, and whether Sentry is running."
      breadcrumbs={[
        { href: "/app/agents", label: "Agents" },
        { href: "/app/agents/response-health", label: "Response health" },
      ]}
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="mb-4 text-sm text-muted-foreground">
        {rows.length} workspaces · {missed} missed windows open · {stopped} with Sentry stopped
      </p>
      <Panel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Sentry</TableHead>
              <TableHead className="text-right">Watched</TableHead>
              <TableHead className="text-right">At risk</TableHead>
              <TableHead className="text-right">Missed</TableHead>
              <TableHead className="text-right">Open alerts</TableHead>
              <TableHead className="text-right">Oldest alert</TableHead>
              <TableHead className="text-right">Median first touch</TableHead>
              <TableHead className="text-right">Within window</TableHead>
              <TableHead className="text-right">Follow-ups on cadence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.org_id}>
                <TableCell className="font-medium text-card-foreground">
                  {row.name}
                  {row.org_status !== "active" ? <span className="block text-xs text-muted-foreground">{row.org_status}</span> : null}
                </TableCell>
                <TableCell title={row.status.detail}>
                  <StatusBadge
                    label={row.mode === "off" ? "Off" : `${row.mode === "live" ? "Live" : "Practice"} · ${row.status.state}`}
                    tone={STATE_TONE[row.status.state]}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.watched}</TableCell>
                <TableCell className="text-right tabular-nums">{row.at_risk}</TableCell>
                <TableCell className={`text-right tabular-nums ${Number(row.missed) ? "text-destructive" : ""}`}>{row.missed}</TableCell>
                <TableCell className="text-right tabular-nums">{row.open_alerts}</TableCell>
                <TableCell className="text-right tabular-nums">{age(row.oldestMinutes)}</TableCell>
                <TableCell className="text-right tabular-nums">{minutes(row.median_first_touch_seconds)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {percent(row.within_window_percent)}
                  <span className="block text-xs text-muted-foreground">of {row.first_touches}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {percent(row.gaps_met_percent)}
                  <span className="block text-xs text-muted-foreground">of {row.gaps}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
      <p className="mt-2 text-xs text-muted-foreground">
        Measurements cover the last 30 days. Open a workspace and go to <Link href="/app/agents/sentry" className="underline">Sentry</Link> for its alerts.
      </p>
      <SentryQuality templates={SEED_TEMPLATES.map((template) => template.slug)} runs={quality} canRun={ctx.isPlatformAdmin} />
    </PageFrame>
  );
}
