import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { AgentDetail } from "@/components/live/agent-pages";
import { ScribeReprocess } from "@/components/live/scribe-reprocess";
import { RelayPanel } from "@/components/relay/relay-panel";
import { SentryPanel } from "@/components/sentry/sentry-panel";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AGENTS, isLiveAgentId } from "@/lib/agents/roster";
import { getAuthContext } from "@/lib/auth/session";
import { loadAgentPage } from "@/lib/live/load";
import { loadRelaySection } from "@/lib/relay/page";
import { RUN_STATUS_LABEL, type RunStatus } from "@/lib/live/model";
import { sentryStatus, summarizeMeasures, type MeasureRow } from "@/lib/sentry/measures";

export const dynamic = "force-dynamic";

function dateParam(value: string | undefined, endOfDay = false): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString();
}

export async function generateMetadata({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  return { title: isLiveAgentId(agent) ? AGENTS[agent].name : "Agent" };
}

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ agent: string }>;
  searchParams: Promise<{ result?: string; from?: string; to?: string }>;
}) {
  const [{ agent }, query, ctx] = await Promise.all([params, searchParams, getAuthContext()]);
  if (!isLiveAgentId(agent)) notFound();
  const result = query.result && query.result in RUN_STATUS_LABEL ? (query.result as RunStatus) : null;
  const data = await loadAgentPage(ctx.org.id, agent, {
    result,
    from: dateParam(query.from),
    to: dateParam(query.to, true),
  });
  const identity = AGENTS[agent];
  const canPause = ctx.isStaff || ctx.workspaceRole === "owner";

  return (
    <PageFrame
      title={identity.name}
      description={identity.role}
      breadcrumbs={[
        { href: "/app/agents", label: "Agents" },
        { href: `/app/agents/${agent}`, label: identity.name },
      ]}
    >
      <AgentDetail
        agentId={agent}
        current={data.current}
        history={data.history}
        stats={data.stats}
        control={data.control}
        canPause={canPause}
        showConfig={ctx.isStaff}
        filter={{ result, from: query.from ?? "", to: query.to ?? "" }}
      />
      {agent === "scribe" && canPause ? <ScribeReprocess /> : null}
      {agent === "sentry" ? <SentrySection orgId={ctx.org.id} canControl={canPause} /> : null}
      {agent === "relay" ? <RelaySection orgId={ctx.org.id} isStaff={ctx.isStaff} /> : null}
    </PageFrame>
  );
}

async function RelaySection({ orgId, isStaff }: { orgId: string; isStaff: boolean }) {
  const data = await loadRelaySection(orgId, isStaff);
  return <RelayPanel data={data} isStaff={isStaff} />;
}

async function SentrySection({ orgId, canControl }: { orgId: string; canControl: boolean }) {
  const data = await loadSentrySection(orgId);
  return <SentryPanel canControl={canControl} {...data} />;
}

async function loadSentrySection(orgId: string) {
  const db = (await createClient()) as unknown as SupabaseClient;
  const now = Date.now();
  const since = new Date(now - 30 * 86_400_000).toISOString();
  const count = (states: string[]) =>
    db.from("sentry_clocks").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("state", states);
  const [{ data: space }, { data: org }, watched, onTime, atRisk, missed, { data: alerts }, { data: measured }] = await Promise.all([
    db.from("sentry_workspaces").select("mode, last_sweep_at, last_error").eq("org_id", orgId).maybeSingle(),
    db.from("organizations").select("status").eq("id", orgId).maybeSingle(),
    db.from("sentry_clocks").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    count(["on_time", "paused", "resolved"]),
    count(["at_risk"]),
    count(["missed"]),
    db.from("sentry_alerts").select("id, title, body, lead_id").eq("org_id", orgId).in("status", ["open", "snoozed"]).order("created_at", { ascending: false }).limit(8),
    db.from("sentry_measurements").select("metric, seconds, met").eq("org_id", orgId).gte("recorded_at", since).limit(5000),
  ]);
  const row = (space ?? null) as { mode?: string; last_sweep_at?: string | null; last_error?: string | null } | null;
  const mode = (row?.mode ?? "off") as "off" | "practice" | "live";
  return {
    mode: mode === "practice" || mode === "live" ? mode : ("off" as const),
    liveAllowed: (org as { status?: string } | null)?.status === "active",
    status: sentryStatus({ mode, lastSweepAt: row?.last_sweep_at ?? null, lastError: row?.last_error ?? null, now }),
    measures: summarizeMeasures((measured ?? []) as MeasureRow[]),
    counts: {
      watched: watched.count ?? 0,
      onTime: onTime.count ?? 0,
      atRisk: atRisk.count ?? 0,
      missed: missed.count ?? 0,
    },
    alerts: ((alerts ?? []) as Array<{ id: string; title: string; body: string; lead_id: string }>).map((alert) => ({
      id: alert.id,
      title: alert.title,
      body: alert.body,
      leadId: alert.lead_id,
    })),
  };
}
