"use client";

import { useState } from "react";

import type { SyncRun } from "@/components/connections/meta-effort";
import { HighLevelActionsView, type HighLevelActionsData } from "@/components/connections/highlevel-actions-view";
import { HighLevelView, type HighLevelStatus } from "@/components/connections/highlevel-view";
import { summarize, type Activity, type Contact, type Deal } from "../../../../convex/lib/highLevel";

/** Made-up fixtures: a home-services business with one sales pipeline. No real person or account. */
const DAY = 86_400_000;
const PIPELINES = [
  {
    externalId: "pipe1",
    name: "Sales pipeline",
    stages: [
      { id: "s1", name: "New lead", position: 0 },
      { id: "s2", name: "Contacted", position: 1 },
      { id: "s3", name: "Estimate booked", position: 2 },
      { id: "s4", name: "Estimate sent", position: 3 },
      { id: "s5", name: "Won", position: 4 },
    ],
  },
];
const SOURCES = ["Facebook ads", "Google Ads", "Referral", "Website form", "Google Business Profile"];

function fixtures(now: number) {
  const deals: Deal[] = [];
  const contacts: Contact[] = [];
  const activities: Activity[] = [];
  for (let i = 0; i < 64; i++) {
    const source = SOURCES[i % SOURCES.length];
    const status = i % 4 === 0 ? "won" : i % 7 === 0 ? "lost" : "open";
    const stage = status === "won" ? "s5" : ["s1", "s1", "s2", "s3", "s4"][i % 5];
    const closed = now - ((i * 3) % 80) * DAY;
    deals.push({ externalId: `d${i}`, pipelineId: "pipe1", stageId: stage, status, value: 900 + ((i * 370) % 4200), source, contactId: `c${i}`, assignedTo: null, createdAt: closed - 9 * DAY, updatedAt: closed, lastStageChangeAt: closed, lastStatusChangeAt: closed });
    contacts.push({ externalId: `c${i}`, name: `Lead ${i}`, email: null, phone: null, source, tags: [], addedAt: now - ((i * 5) % 85) * DAY });
  }
  for (let i = 0; i < 140; i++) {
    const kind = (["call", "sms", "sms", "email", "appointment", "stage_change"] as const)[i % 6];
    activities.push({ externalId: `a${i}`, kind, direction: kind === "call" || kind === "sms" || kind === "email" ? (i % 3 ? "outbound" : "inbound") : null, at: now - ((i * 7) % 29) * DAY - 3600_000, contactId: `c${i % 64}`, dealId: null, status: null, seconds: null, fromStage: null, toStage: null });
  }
  for (let i = 0; i < 6; i++) activities.push({ externalId: `up${i}`, kind: "appointment", direction: null, at: now + (i + 1) * DAY, contactId: null, dealId: null, status: "confirmed", seconds: null, fromStage: null, toStage: null });
  return summarize({ currency: "USD", pipelines: PIPELINES, deals, contacts, activities, now });
}

const KEYS = ["access", "pipelines", "deals", "contacts", "activity", "appointments", "save"];
const CALLS = [1, 1, 1, 1, 41, 4, 0];
const ROWS = [1, 1, 64, 64, 118, 22, 268];
const TIMES = [212, 180, 640, 590, 7420, 910, 820];

function runAt(now: number, id: string, trigger: SyncRun["trigger"], agoMs: number, liveAt?: number, failAt?: number): SyncRun {
  const startedAt = now - agoMs;
  const steps = KEYS.map((key, index) => {
    if (failAt !== undefined && index === failAt) return { key, status: "failed" as const, calls: 1, rows: 0, ms: 140 };
    if (failAt !== undefined && index > failAt) return { key, status: "waiting" as const, calls: 0 };
    if (liveAt === undefined || index < liveAt) return { key, status: "done" as const, calls: CALLS[index], rows: ROWS[index], ms: TIMES[index] };
    return { key, status: index === liveAt ? ("working" as const) : ("waiting" as const), calls: 0 };
  });
  const calls = steps.reduce((sum, step) => sum + step.calls, 0);
  return {
    id,
    trigger,
    status: liveAt !== undefined ? "running" : failAt !== undefined ? "failed" : "done",
    code: liveAt !== undefined ? null : failAt !== undefined ? "rate_limited" : "ok",
    startedAt,
    finishedAt: liveAt !== undefined ? null : startedAt + 11_000,
    steps,
    callsOk: failAt !== undefined ? calls - 1 : calls,
    callsFailed: failAt !== undefined ? 1 : 0,
  };
}

function usageAt(now: number) {
  const days = Array.from({ length: 15 }, (_, index) => ({ day: new Date(now - (14 - index) * DAY).toISOString().slice(0, 10), ok: index < 6 ? 0 : 196, failed: index === 11 ? 1 : 0 }));
  const ok = days.reduce((sum, row) => sum + row.ok, 0);
  const failed = days.reduce((sum, row) => sum + row.failed, 0);
  return { days, ok, failed, successRate: ok / (ok + failed) };
}

function statusFor(state: string, now: number): HighLevelStatus {
  const owner = state !== "admin";
  const base = { configured: state !== "notsetup", canConnect: owner, canRefresh: true, isOwner: owner };
  if (state === "none" || state === "notsetup" || state === "slot") return { ...base, connection: null, summary: null, runs: [], usage: null };
  const connection = {
    status: state === "reconnect" ? "needsReconnect" : "connected",
    accountId: "aB3dE5fG7hJ9kL1mN2pQ",
    accountName: "Brightside Home Services",
    currency: "USD",
    connectedAt: now - 9 * DAY,
    scopes: [],
    lastSyncAt: now - 42 * 60_000,
    lastSyncCode: state === "ratelimited" ? "rate_limited" : "ok",
    running: state === "reading",
    calls: { ok: 1180, failed: 1, successRate: 1180 / 1181 },
  };
  const runs = [
    ...(state === "reading" ? [runAt(now, "live", "manual", 4200, 4)] : []),
    ...(state === "ratelimited" ? [runAt(now, "rl", "schedule", 42 * 60_000, undefined, 3)] : [runAt(now, "r1", "schedule", 42 * 60_000)]),
    runAt(now, "r2", "schedule", 6 * 3_600_000 + 42 * 60_000),
    runAt(now, "r3", "manual", 9 * 3_600_000),
    runAt(now, "r4", "connect", 9 * DAY),
  ];
  return { ...base, connection, summary: { syncedAt: now - 42 * 60_000, ...fixtures(now) }, runs: owner ? runs : [], usage: owner ? usageAt(now) : null };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Acting fixtures: made-up leads and deals. */
function actingFor(state: string, now: number): HighLevelActionsData {
  const owner = state !== "acting-admin";
  const enabled = state !== "acting-off";
  const base = { id: "", why: "", lead: null, body: null, restricted: null, mayTriggerAutomation: true, proposedBy: "dealmaker", decidedAt: null, doneAt: null, resultCode: null, canUndo: false, undone: false };
  const actions: HighLevelActionsData["actions"] = enabled
    ? [
        { ...base, id: "a1", kind: "move_stage", summary: "HighLevel: move a deal from Contacted to Estimate booked", why: "She booked a site visit for Thursday in her last text.", lead: "Lead 12", state: "proposed", proposedAt: now - 12 * 60_000 },
        { ...base, id: "a2", kind: "set_status", summary: "HighLevel: mark a deal won (now open)", why: "The signed estimate came back by email this morning.", lead: "Lead 4", state: "proposed", restricted: { word: "VALUE", why: "It changes a deal's outcome, and so the revenue your team reports." }, proposedAt: now - 40 * 60_000 },
        { ...base, id: "a3", kind: "add_note", summary: "HighLevel: add a note to a lead", why: "From Tuesday's call.", lead: "Lead 9", body: "Prefers mornings. Asked about financing for the deck.", state: "done", mayTriggerAutomation: false, proposedBy: "person", proposedAt: now - 5 * 3_600_000, decidedAt: now - 4 * 3_600_000, doneAt: now - 4 * 3_600_000, resultCode: "ok" },
        { ...base, id: "a4", kind: "add_tag", summary: 'HighLevel: add the tag "estimate-sent" to a lead', why: "Estimate sent Monday.", lead: "Lead 21", state: "done", proposedAt: now - 26 * 3_600_000, doneAt: now - 25 * 3_600_000, resultCode: "ok", canUndo: true },
        { ...base, id: "a5", kind: "create_task", summary: 'HighLevel: create the task "Call back about the quote" on a lead', why: "No reply in three days.", lead: "Lead 30", state: "declined", proposedAt: now - 30 * 3_600_000 },
      ]
    : [];
  return {
    connected: true,
    enabled,
    can: { toggle: owner, propose: true, approve: true, approveRestricted: owner },
    actions,
    deals: [
      { id: "d1", pipelineId: "pipe1", stage: "Contacted", stageId: "s2", value: 4200, lead: "Lead 12" },
      { id: "d4", pipelineId: "pipe1", stage: "Estimate sent", stageId: "s4", value: 3100, lead: "Lead 4" },
    ],
    leads: [
      { id: "c12", name: "Lead 12", tags: ["facebook"] },
      { id: "c21", name: "Lead 21", tags: ["estimate-sent"] },
    ],
    stages: PIPELINES.map((pipeline) => ({ pipelineId: pipeline.externalId, name: pipeline.name, stages: pipeline.stages.map((stage) => ({ id: stage.id, name: stage.name })) })),
  };
}

export function HighLevelConnectionStory({ state }: { state: string }) {
  const [now] = useState(() => Date.now());
  const slot = state.startsWith("slot");
  const acting = state.startsWith("acting");
  const view = (
    <HighLevelView
      status={statusFor(state === "slot-connected" || acting ? (state === "acting-admin" ? "admin" : "connected") : state, now)}
      returned={state === "reading" ? "connected" : null}
      forName={slot ? null : "Brightside Home Services"}
      compact={slot}
      manageHref={slot ? "/dev/highlevel-connection?state=connected" : undefined}
      actions={{ connect: async () => wait(300), sync: async () => (await wait(300), { code: "ok" }), disconnect: async () => wait(300) }}
    />
  );
  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className={slot ? "mx-auto grid max-w-xl gap-4" : "mx-auto grid max-w-6xl gap-4"}>
        <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
          HighLevel connection story. Made-up fixtures. States: none, notsetup, admin, connected, reading, reconnect, ratelimited, slot, slot-connected, acting-off, acting, acting-admin.
        </p>
        {acting ? (
          <HighLevelActionsView
            data={actingFor(state, now)}
            handlers={{ setActing: async () => wait(300), propose: async () => (await wait(300), null), decide: async () => (await wait(300), null), undo: async () => (await wait(300), null) }}
          />
        ) : (
          view
        )}
      </div>
    </div>
  );
}
