"use client";

import { LandingPagesView, type LandingPageRow } from "@/components/work/landing-page-view";
import type { PageLayout } from "../../../../convex/skills/landingPageBuild/shapes";

import { StoryFrame } from "../work-tabs/story-frame";

/** A coach for therapists in private practice, with no website yet: their first landing page. */
const PAGE: PageLayout = {
  goal: "Book a practice review call",
  audience: "Therapists in private practice seeing fewer than 15 clients a week",
  nav: { cta: "Book a review call" },
  hero: { qualifier: "For therapists in private practice seeing fewer than 15 clients a week", headline: "A full calendar in 60 days, without becoming a marketer", subline: "Your listing, your replies and your referrals, rebuilt around the clients you want.", cta: "Book a review call", scarcity: "", from: [] },
  results: [{ metric: "6 → 19", context: "clients a week in one practice", quote: "My calendar finally fills itself.", name: "Dr. Lena Ortiz", role: "Licensed therapist", from: [] }],
  problem: [
    { moment: "A referral emails on Friday and you reply on Tuesday", cost: "A client who booked elsewhere", from: [] },
    { moment: "Your directory listing reads like the ten above it", cost: "No calls from the listing this month", from: [] },
    { moment: "You paid a retainer that never said what you would get", cost: "Money with no end date", from: [] },
  ],
  solution: [{ outcome: "Every enquiry gets a reply the same day", from: [] }, { outcome: "Your listing says exactly who you help and how", from: [] }, { outcome: "One 60-day program with one clear outcome", from: [] }],
  offer: { deliverables: ["A rewritten directory listing", "A same-day reply system", "Six weekly coaching calls", "A referral note for colleagues"], effortLine: "You bring your practice. We build everything else.", price: "$1,800", delivery: "60 days", from: [] },
  compare: [{ without: "Waiting on referrals", with: "A steady flow of enquiries" }, { without: "Guessing what to write", with: "One clear message" }, { without: "Retainers that never end", with: "A fixed 60 days" }],
  process: [{ step: "A review call about your practice", yourTime: "30 minutes" }, { step: "We rewrite your listing and replies", yourTime: "15 minutes to approve" }, { step: "Weekly coaching", yourTime: "45 minutes a week" }],
  roles: { yours: ["Join the calls", "Approve the listing"], ours: ["Rewrite the listing", "Build the reply system", "Write the referral note", "Run the coaching", "Track your enquiries"] },
  faq: [
    { question: "What does it cost?", answer: "$1,800 for the full 60 days.", topic: "price", from: [] },
    { question: "Is there a guarantee?", answer: "No guarantee is stated yet. Ask on the call.", topic: "guarantee", from: [] },
    { question: "Is this for me?", answer: "If you see fewer than 15 clients a week in private practice, yes.", topic: "whoFor", from: [] },
    { question: "How long does it take?", answer: "60 days, with about 45 minutes a week of your time.", topic: "howLong", from: [] },
    { question: "What if it doesn't work for my practice?", answer: "We look at your numbers on the review call before you start.", topic: "whatIf", from: [] },
  ],
  finalCta: { line: "A full calendar in 60 days.", cta: "Book a review call", timing: "" },
  limits: [],
};

const ROWS: Record<string, LandingPageRow[]> = {
  approved: [{ id: "a1", title: "Landing page: Full Calendar in 60 Days", status: "approved", layout: PAGE, failed: [], leftOut: [] }],
  review: [
    {
      id: "a1",
      title: "Landing page: Full Calendar in 60 Days",
      status: "needsReview",
      layout: { ...PAGE, results: [], solution: PAGE.solution.slice(0, 2) },
      failed: ["Each pain has its own fix, one for one: There are 3 pains and 2 fixes; the framework wants the same number, 3 to 6."],
      leftOut: ["No testimonials or results are on record, so the Results section is left out."],
    },
  ],
};

export function LandingPageStory({ state }: { state: string }) {
  return (
    <StoryFrame theme="light">
      <LandingPagesView rows={ROWS[state] ?? ROWS.approved} />
    </StoryFrame>
  );
}
