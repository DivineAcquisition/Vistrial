"use client";

import { useState } from "react";

import { BillingView, type BillingData } from "@/components/billing/billing-view";
import { AddOrganizationDialog } from "@/components/shell/organization-switcher";
import type { Id } from "../../../../convex/_generated/dataModel";
import { StoryTheme } from "../story-theme";

const NOW = 1794150000000;
const LEDGER: BillingData["ledger"] = [
  { id: "l1", source: "run", ref: "r1", costCents: 82, priceCents: 246, at: NOW - 3_600_000, synced: true },
  { id: "l2", source: "followup", ref: "c1", costCents: 3, priceCents: 9, at: NOW - 7_200_000, synced: true },
  { id: "l3", source: "intake", ref: "i1", costCents: 14, priceCents: 42, at: NOW - 9_000_000, synced: true },
  { id: "l4", source: "file", ref: "f1", costCents: 2, priceCents: 6, at: NOW - 86_400_000, synced: false },
];

function data(state: string): BillingData {
  const base: BillingData = {
    on: state !== "off",
    canManage: true,
    markup: 3,
    plan: { id: "growth", name: "Growth", priceCents: 17900, includedCents: 15000 },
    packs: [1000, 2500, 5000],
    autoRefillDefaults: { thresholdCents: 200, amountCents: 1000, maxPerMonth: 4 },
    account: null,
    spent30dCents: 303,
    ledger: LEDGER,
  };
  // An agency owner's account with three organizations of her own; ?state=account-admin is someone who runs one of them.
  if (state === "account" || state === "account-admin" || state === "account-closed") {
    const owner = state !== "account-admin";
    return {
      ...base,
      canManage: owner,
      accountName: "Northlight",
      account: { balanceCents: 18340, planId: "growth", planStatus: "active", nextResetAt: NOW + 12 * 86_400_000, autoRefill: { enabled: true, thresholdCents: 200, amountCents: 1000 }, refreshedAt: NOW },
      spent30dCents: 6912,
      organizations: [
        { workspaceId: "w1", name: "Northlight Growth", current: owner, first: true, spent30dCents: 6912 },
        { workspaceId: "w2", name: "Northlight Coaching", current: !owner, first: false, spent30dCents: 2148 },
        { workspaceId: "w3", name: "The Retainer Playbook", current: false, first: false, spent30dCents: 471 },
      ].filter((row) => owner || row.current),
      extra: { priceCents: 9900, includedCents: 5000, count: 2, monthlyCents: 17900 + 2 * 9900, monthlyCreditsCents: 15000 + 2 * 5000, canAdd: owner && state !== "account-closed", closedReason: state === "account-closed" ? "Adding another organization is not switched on yet. Contact us and we will add it for you." : null, needsPlan: false, pendingName: null },
    };
  }
  if (state === "off") return { ...base, account: null, ledger: [], spent30dCents: 0 };
  if (state === "empty") return { ...base, account: { balanceCents: -12, planId: null, planStatus: null, nextResetAt: null, autoRefill: null, refreshedAt: NOW } };
  if (state === "low") return { ...base, account: { balanceCents: 140, planId: "growth", planStatus: "active", nextResetAt: NOW + 12 * 86_400_000, autoRefill: { enabled: false, thresholdCents: 200, amountCents: 1000 }, refreshedAt: NOW } };
  return { ...base, account: { balanceCents: 3697, planId: "growth", planStatus: "active", nextResetAt: NOW + 12 * 86_400_000, autoRefill: { enabled: true, thresholdCents: 200, amountCents: 1000 }, refreshedAt: NOW } };
}

export function BillingStory({ state, theme = "light" }: { state: string; theme?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <StoryTheme theme={theme} />
      <BillingView
        data={data(state)}
        busy={busy}
        notice=""
        actions={{ subscribe: () => setBusy("plan"), topUp: (cents) => setBusy(`topup:${cents}`), autoRefill: () => setBusy("refill"), portal: () => setBusy("portal"), addOrganization: () => setAdding(true) }}
      />
      <AddOrganizationDialog
        open={adding}
        onOpenChange={setAdding}
        account={{ accountId: "a1" as Id<"accounts">, name: "Northlight", owner: true, canAdd: state !== "account-closed", addClosedReason: state === "account-closed" ? "Adding another organization is not switched on yet. Contact us and we will add it for you." : null, addPrice: { priceCents: 9900, includedCents: 5000 } }}
        onAdd={async () => null}
      />
    </main>
  );
}
