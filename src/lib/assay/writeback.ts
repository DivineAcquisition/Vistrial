import type { Tier } from "@/lib/assay/types";
import { TIER_LABEL } from "@/lib/assay/types";

export type WritebackSettings = {
  enabled: boolean;
  ownerConfirmed: boolean;
  dryRunCompleted: boolean;
  killSwitch: boolean;
  connectionLive: boolean;
  target: "field" | "tag";
};

export type WritebackDecision =
  | { action: "skip"; reason: string }
  | { action: "dry_run"; tier: Tier; label: string }
  | { action: "write"; tier: Tier; label: string; removePreviousTag: boolean };

const HOUR_MS = 60 * 60 * 1000;

export function decideWriteback(args: {
  settings: WritebackSettings;
  previousTier: Tier | null;
  nextTier: Tier;
  lastWriteAt: string | null;
  now: string;
  mode: "live" | "historic" | "rules_change" | "nightly" | "sync";
  doNotContact: boolean;
}): WritebackDecision {
  const label = TIER_LABEL[args.nextTier];
  if (!args.settings.enabled) return { action: "skip", reason: "Writeback is off." };
  if (args.settings.killSwitch) return { action: "skip", reason: "The writeback kill switch is on." };
  if (!args.settings.connectionLive) return { action: "skip", reason: "The connection is not live." };
  if (!args.settings.ownerConfirmed) return { action: "skip", reason: "The owner has not confirmed writeback." };
  if (args.doNotContact) return { action: "skip", reason: "Do not contact leads are not written." };
  if (args.mode === "historic" || args.mode === "rules_change") {
    return { action: "skip", reason: "Historic scoring and rules changes do not write unless you sync tiers." };
  }
  if (args.previousTier === args.nextTier && args.mode !== "sync") return { action: "skip", reason: "The tier did not change." };
  if (args.lastWriteAt && Date.parse(args.now) - Date.parse(args.lastWriteAt) < HOUR_MS) {
    return { action: "skip", reason: "This lead was written in the last hour." };
  }
  if (!args.settings.dryRunCompleted && args.mode !== "sync") {
    return { action: "dry_run", tier: args.nextTier, label };
  }
  if (args.mode === "sync" && !args.settings.dryRunCompleted) return { action: "dry_run", tier: args.nextTier, label };
  return {
    action: "write",
    tier: args.nextTier,
    label,
    removePreviousTag: args.settings.target === "tag" && args.previousTier != null && args.previousTier !== args.nextTier,
  };
}
