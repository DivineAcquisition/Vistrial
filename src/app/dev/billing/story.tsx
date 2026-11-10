"use client";

import { useState } from "react";

import { BillingView, type BillingData } from "@/components/billing/billing-view";

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
  if (state === "off") return { ...base, account: null, ledger: [], spent30dCents: 0 };
  if (state === "empty") return { ...base, account: { balanceCents: -12, planId: null, planStatus: null, nextResetAt: null, autoRefill: null, refreshedAt: NOW } };
  if (state === "low") return { ...base, account: { balanceCents: 140, planId: "growth", planStatus: "active", nextResetAt: NOW + 12 * 86_400_000, autoRefill: { enabled: false, thresholdCents: 200, amountCents: 1000 }, refreshedAt: NOW } };
  return { ...base, account: { balanceCents: 3697, planId: "growth", planStatus: "active", nextResetAt: NOW + 12 * 86_400_000, autoRefill: { enabled: true, thresholdCents: 200, amountCents: 1000 }, refreshedAt: NOW } };
}

export function BillingStory({ state }: { state: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8">
      <BillingView
        data={data(state)}
        busy={busy}
        notice=""
        actions={{ subscribe: () => setBusy("plan"), topUp: (cents) => setBusy(`topup:${cents}`), autoRefill: () => setBusy("refill"), portal: () => setBusy("portal") }}
      />
    </main>
  );
}
