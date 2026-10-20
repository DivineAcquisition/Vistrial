import "server-only";

import { cache } from "react";

import { api } from "../../../convex/_generated/api";
import { DEFAULT_OUTCOME_METRICS, type OutcomeMetricId, type SectionId, type VisitResult } from "../../../convex/homeRules";
import type { AuthContext } from "@/lib/auth/types";
import { userConvex } from "@/lib/directory/commit";
import { localDate } from "@/lib/home/periods";
import type { BriefingFacts } from "@/lib/workspace/voice";

const CONVEX_HOME_MS = 1500;

export type HomeState = {
  /** False when Convex is unreachable: the current Home keeps showing. */
  available: boolean;
  enabled: boolean;
  outcomeMetrics: OutcomeMetricId[];
  prefs: {
    collapsed: SectionId[];
    workOrder: "best" | "oldest";
    workScope: "mine" | "everyone" | "auto";
    firstSeenAt: number | null;
    welcomeDismissedAt: number | null;
  };
  visit: VisitResult;
  snoozedLeadIds: string[];
  briefings: Array<{ day: string; sinceAt: number | null; facts: StoredBriefingFacts }>;
  day: string;
  now: number;
};

/** Saved per day in Convex: counts and lead ids, never names or text. */
export type StoredBriefingFacts = Omit<BriefingFacts, "assayNewlyHot"> & { assayNewlyHotIds: string[] };

function fallback(now: number, day: string): HomeState {
  return {
    available: false,
    enabled: false,
    outcomeMetrics: DEFAULT_OUTCOME_METRICS,
    prefs: { collapsed: [], workOrder: "best", workScope: "auto", firstSeenAt: null, welcomeDismissedAt: null },
    visit: {
      sinceAt: now - 86_400_000,
      capped: false,
      firstViewToday: true,
      firstVisit: false,
      next: { lastVisitAt: now, visitDay: day, sinceAt: now - 86_400_000, briefingSeenDay: null },
    },
    snoozedLeadIds: [],
    briefings: [],
    day,
    now,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/** One Convex read per request, shared by the shell and the page. */
export const loadHomeState = cache(async (ctx: AuthContext): Promise<HomeState> => {
  const now = Date.now();
  const day = localDate(new Date(now), ctx.org.timezone);
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return fallback(now, day);
  try {
    const client = await userConvex();
    const state = await withTimeout(client.query(api.home.state, { workspaceId: ctx.org.id, day, now }), CONVEX_HOME_MS);
    return {
      available: true,
      enabled: state.enabled,
      outcomeMetrics: state.outcomeMetrics as OutcomeMetricId[],
      prefs: state.prefs as HomeState["prefs"],
      visit: state.visit,
      snoozedLeadIds: state.snoozedLeadIds,
      briefings: state.briefings as HomeState["briefings"],
      day,
      now,
    };
  } catch {
    return fallback(now, day);
  }
});

/** The agentic workspace is on for this workspace. Off when Convex cannot answer. */
export async function agenticHomeEnabled(ctx: AuthContext): Promise<boolean> {
  const state = await loadHomeState(ctx);
  return state.available && state.enabled;
}
