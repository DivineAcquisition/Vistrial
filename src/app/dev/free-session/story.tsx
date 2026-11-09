"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, useState } from "react";

import { FreeSession, type FreeSessionData } from "@/components/onboarding/free-session";
import { STATUS_META } from "@/lib/runs/view";
import { SOURCES, STEPS, studioFor } from "../research-studio/story";
import type { Id } from "../../../../convex/_generated/dataModel";

const WS = "ws1" as Id<"workspaces">;
const BUSINESS = { name: "DivineACQ", offer: "AI-powered sales and client-retention systems for service businesses", area: "United States", website: "https://divineacquisition.io/" };
const PLAN = { name: "Growth", priceCents: 4900, includedCents: 4000 };

/** The free session with an in-memory backend: every state, no sign-in. */
export function FreeSessionStory({ state }: { state: string }) {
  const client = useMemo(() => new ConvexReactClient("https://example.convex.cloud"), []);
  const [now] = useState(() => Date.now());
  const [stage, setStage] = useState<FreeSessionData["stage"]>(state.startsWith("paywall") ? "paywall" : "freeSession");
  const kind = state === "report" || state.startsWith("paywall") ? "done" : state === "waiting" ? "waiting" : "working";

  const session = useMemo((): FreeSessionData["session"] => {
    if (state === "starting") return null;
    const base = studioFor(kind);
    const stopped = state === "stopped";
    const run = base.run
      ? { ...base.run, startedAt: kind === "done" ? base.run.startedAt : now - 150_000, ...(stopped ? { status: "failed", finishedAt: now - 20_000 } : {}) }
      : null;
    const studio = { ...base, run, ...(stopped ? { report: null, checks: null } : {}) } as typeof base;
    const steps = (STEPS[kind] ?? STEPS.waiting).map((row) => (kind === "working" && row.at ? { ...row, at: row.at - 1793800000000 + now - 150_000 } : row));
    const open = (kind === "working" || kind === "waiting") && !stopped;
    return {
      studio,
      steps,
      open,
      meta: kind === "done" ? STATUS_META.completed : kind === "waiting" ? STATUS_META.waiting : STATUS_META.running,
      statuses:
        kind === "waiting"
          ? []
          : [
              { platform: "web", state: "partial", reasonCode: "ok", found: 30 },
              { platform: "youtube", state: "available", reasonCode: "ok", found: 22 },
              { platform: "tiktok", state: "available", reasonCode: "ok", found: 8 },
            ],
      sources: new Map(kind === "waiting" ? [] : SOURCES.map((row) => [row.id, row])),
      counts: new Map(),
      reportAsset: kind === "done" && !stopped ? { id: "a1", title: "Market report", status: "draft", currentVersion: 1 } : null,
      assetStatus: kind === "done" && !stopped ? "draft" : null,
      capCents: 300,
    };
  }, [state, kind, now]);

  return (
    <ConvexProvider client={client}>
      <FreeSession
        data={{
          stage,
          workspaceId: WS,
          business: BUSINESS,
          freeAttempts: 1,
          maxAttempts: 2,
          billing: { on: state !== "paywall-off", testMode: state === "paywall", paid: false, plan: PLAN },
          session,
        }}
        actions={{
          start: async () => undefined,
          paywall: async (open) => setStage(open ? "paywall" : "freeSession"),
          subscribe: async () => ({ url: null }),
          unlock: async () => ({ unlocked: false }),
        }}
      />
    </ConvexProvider>
  );
}
