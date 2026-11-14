"use client";

import { ProposalPublic, type ProposalPageData } from "@/components/proposal/proposal-public";

/** A small agency's proposal to a dental group, as the lead sees it. Sample data. */
function proposal(state: string): ProposalPageData {
  return {
    business: "Northlight Growth",
    leadName: "Marcus Hale",
    title: "The Growth retainer for Hale Dental",
    intro: "Thanks for the call, Marcus. You want to double the consults you book before spring, and your co-founder will want to see the plan first. Here is how the Growth retainer would work for you.",
    needs: ["Twice the booked consultations by spring", "A plan your co-founder can read first"],
    package: { title: "Growth retainer", body: "Twelve weeks. Weekly strategy call, ads managed, follow-up run for you, monthly report." },
    deliverables: ["Weekly strategy call", "ads managed", "follow-up run for you", "monthly report"],
    price: { title: "Growth retainer: $3,000 a month", body: "Three-month minimum. No setup fee." },
    guarantee: { title: "30 booked calls in the first 60 days, or the next month is free", body: "" },
    proof: [{ title: "Harbor Dental: 41 booked consultations in 60 days", body: "" }],
    nextSteps: ["Share this with Sam before Monday", "Reply with any questions, or book a short call to go through it together"],
    closing: "We look forward to hearing what you and Sam think.",
    acceptedAt: state === "accepted" ? Date.UTC(2026, 10, 14, 10) : null,
    acceptedName: state === "accepted" ? "Marcus Hale" : null,
    payment: state === "stripe" ? "ready" : "notSetUp",
  };
}

export function ProposalPageStory({ state, theme }: { state: string; theme: string }) {
  return (
    <div className={theme === "dark" ? "dark" : undefined}>
      <ProposalPublic proposal={proposal(state)} onSeen={async () => undefined} onAccept={async () => ({ ok: true })} />
    </div>
  );
}
