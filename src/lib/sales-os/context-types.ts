import type { Finding } from "@/lib/sales-os/analysis";
import type { ContextFingerprint } from "@/lib/sales-os/context-cache";

export type Leak = {
  title: string;
  evidence: string;
  sample: string;
  /** What Vistrial would do about it, phrased as something to ask. */
  ask: string;
};

export type ContextPackage = {
  version: 1;
  builtAt: string;
  orgName: string;
  personName: string;
  role: string;
  canSeeMoney: boolean;
  thin: boolean;
  thinReasons: string[];
  totals: {
    leads90: number;
    leads30: number;
    leadsPrior30: number;
    callsHeld90: number;
    transcripts90: number;
    objections90: number;
    closes90: number;
  };
  targets: {
    monthlyLeadTarget: number | null;
    responseTargetMinutes: number | null;
    statedCloseRatePct: number | null;
    salesCycleDays: number | null;
  };
  volumeBySource30: Array<{ source: string; leads: number }>;
  funnel: Finding;
  sources: Finding;
  objections: Finding;
  response: Finding;
  month: Finding;
  sinceLast: null | {
    lastConversationAt: string;
    newLeads: number;
    newHeldCalls: number;
    newCloses: number;
    newObjections: number;
    beyondWindow: boolean;
  };
  leaks: Leak[];
  fingerprint: ContextFingerprint;
};

export type OpeningState = {
  conversationReady: boolean;
  greetingName: string;
  lines: string[];
  leaks: Leak[];
  thin: boolean;
  thinReasons: string[];
  builtAt: string;
  suggestions: Array<{ prompt: string; label: string }>;
};
