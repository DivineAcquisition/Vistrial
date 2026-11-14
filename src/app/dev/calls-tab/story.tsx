"use client";

import { useState } from "react";

import { CallsView, type BriefData, type CallsData } from "@/components/work/calls-tab";

import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;

/** A coaching agency's week of booked calls. Sample data. */
function calls(state: string): CallsData {
  const base = { canRequest: state !== "viewer", maxCredits: 75, scopeWhy: "You see every deal." };
  const recent = [
    { id: "b1", leadName: "Jordan Lee", when: "Sun, Nov 15, 3:00 PM", state: "ready" as const, createdAt: 1 },
    { id: "b0", leadName: "Priya Raman", when: "Thu, Nov 12, 11:00 AM", state: "ready" as const, createdAt: 0 },
  ];
  if (state === "nocrm") return { ...base, connected: false, upcoming: [], recent: recent.slice(1).map((row) => ({ ...row, when: null })) } as unknown as CallsData;
  return {
    ...base,
    connected: true,
    crm: { label: "HighLevel", accountName: "Northlight Growth" },
    upcoming: [
      { ref: "a1", startsAt: 1, when: "Sun, Nov 15, 3:00 PM", status: "confirmed", contactRef: "c1", dealRef: "d1", leadName: "Jordan Lee", source: "Facebook ads", stage: "Proposal sent", brief: recent[0] },
      { ref: "a2", startsAt: 2, when: "Mon, Nov 16, 10:30 AM", status: "booked", contactRef: "c2", dealRef: "d2", leadName: "Riley Park", source: "Referral", stage: "Call booked", brief: { id: "b2", leadName: "Riley Park", when: "Mon, Nov 16, 10:30 AM", state: "running", createdAt: 2 } },
      { ref: "a3", startsAt: 3, when: "Tue, Nov 17, 4:00 PM", status: "booked", contactRef: "c3", dealRef: null, leadName: "Sam Okafor-Whitfield, Okafor Coaching Collective", source: "Webinar", stage: null, brief: null },
    ],
    recent,
  } as unknown as CallsData;
}

function brief(state: string): BriefData {
  const first = state === "first";
  return {
    id: "b1",
    leadName: "Jordan Lee",
    when: "Sun, Nov 15, 3:00 PM",
    state: "ready",
    createdAt: 1,
    assetId: "asset1",
    view: {
      summary: first ? "" : "Jordan had a discovery call and is waiting on a proposal. Who signs off is not settled, and timing has not come up.",
      codeOnly: first,
      checksPassed: true,
      firstCall: first,
      facts: [
        { group: "who", label: "Booked call", display: "Sun, Nov 15, 3:00 PM (confirmed)", kind: "Recorded event" },
        { group: "who", label: "Lead source", display: "Facebook ads", kind: "Recorded event" },
        { group: "who", label: "Deal stage", display: "Proposal sent (Sales calls)", kind: "Recorded event" },
        { group: "who", label: "Deal value", display: "$4,500", kind: "Recorded event" },
        { group: "soFar", label: "Days since the lead was added", display: "12", kind: "Measured result" },
        { group: "soFar", label: "Touches recorded", display: "1 call, 3 texts, 1 email", kind: "Recorded event" },
        { group: "soFar", label: "Last touch", display: "a text (outbound) on Nov 12, 2026", kind: "Recorded event" },
      ],
      readiness: first
        ? ["Need", "Budget", "Who decides", "Timing", "Fit with the offer"].map((label, i) => ({ field: String(i), label, established: false, finding: "", quote: "" }))
        : [
            { field: "need", label: "Need", established: true, finding: "More booked calls each month", quote: "We need more booked calls every month, the pipeline is thin.", kind: "Buyer's words", source: "call: Discovery call (2026-11-08)" },
            { field: "budget", label: "Budget", established: true, finding: "Around $3,000 a month", quote: "Our budget is around $3,000 a month.", kind: "Buyer's words", source: "call: Discovery call (2026-11-08)" },
            { field: "decider", label: "Who decides", established: true, finding: "A business partner signs off", quote: "the partner signs off on anything over $2,000", kind: "Rep's account", source: "Hand-off from Ada" },
            { field: "timing", label: "Timing", established: false, finding: "", quote: "" },
            { field: "fit", label: "Fit with the offer", established: false, finding: "", quote: "" },
          ],
      ...(first ? {} : { handoff: { by: "Ada", text: "Booked from the webinar. Jordan said the partner signs off on anything over $2,000." } }),
      commitments: first ? [] : [{ owner: "We", what: "Send the Harbor case study", due: "Friday", quote: "I'll send the case study on Friday." }],
      disagreements: first ? [] : ["The CRM says Proposal sent; on the last call Jordan said no proposal has arrived yet."],
      cover: first
        ? []
        : [
            { point: "Ask when the partner can join a call", label: "Inference" },
            { point: "Confirm the case study arrived and what Jordan made of it", label: "Inference" },
            { point: "Walk through the Growth retainer", label: "Untested hypothesis" },
          ],
      ...(first ? {} : { offerFit: { title: "Growth retainer", why: "It covers the booked calls Jordan asked for, within the budget Jordan named." } }),
      objections: first
        ? []
        : [
            { text: "Needs the partner's agreement", where: 'Said on Discovery call (2026-11-08): "I have to check with my business partner before we sign anything."', label: "Your data" },
            { text: "Wants to see results from a similar business", where: "From the Playbook's starter set, not yet heard on your calls", label: "Untested hypothesis" },
          ],
      openingQuestion: first ? "" : "What has changed since we last spoke?",
      missing: first ? ["No earlier call with this lead is linked and shared with Dealmaker, so nothing is quoted from one.", "The Playbook's Offer folder is empty, so the brief names no package."] : [],
    },
  } as unknown as BriefData;
}

export function CallsTabStory({ state, theme }: { state: string; theme: string }) {
  const [open, setOpen] = useState<string | null>(state === "brief" || state === "first" ? "b1" : null);
  return (
    <StoryFrame theme={theme} role={state === "viewer" ? "viewer" : "owner"}>
      <CallsView data={calls(state)} actions={{ request: noop }} open={open ? brief(state) : null} onOpen={setOpen} />
    </StoryFrame>
  );
}
