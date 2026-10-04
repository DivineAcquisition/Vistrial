import { createHash } from "node:crypto";

import type { GateMode } from "@/lib/sales-os/catalog";
import type { OrgRole } from "@/types/database";

/** Missing configuration is the strictest setting, never the loosest. */
export const DEFAULT_GATE_MODE: GateMode = "always_ask";

export type GateDecision = { needsPerson: true; reason: string } | { needsPerson: false; reason: string };

/**
 * Whether a person has to approve this one in the conversation. Mirrors the
 * database trigger; the trigger is the backstop if this ever disagrees.
 */
export function decideGate(mode: GateMode, approvedBeforeToDestination: boolean): GateDecision {
  if (mode === "automatic") return { needsPerson: false, reason: "This workspace runs these without asking." };
  if (mode === "ask_first_time") {
    return approvedBeforeToDestination
      ? { needsPerson: false, reason: "You approved one to this place before, so this one goes on its own." }
      : { needsPerson: true, reason: "This is the first one to this place, so it waits for your OK." };
  }
  return { needsPerson: true, reason: "This workspace asks every time." };
}

export function parseGateMode(value: unknown): GateMode {
  return value === "automatic" || value === "ask_first_time" || value === "always_ask" ? value : DEFAULT_GATE_MODE;
}

/** Only an owner or admin requests, approves, or changes how executions are gated. */
export function canRunExecutions(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)])
    );
  }
  return value;
}

/** What was approved is what runs: the hash of the tool input is fixed at request time. */
export function inputHash(executionType: string, input: unknown): string {
  return createHash("sha256").update(JSON.stringify([executionType, stable(input)])).digest("hex");
}
