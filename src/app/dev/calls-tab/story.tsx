"use client";

import { useState } from "react";

import { CallNotesForm, type NotesData } from "@/components/work/call-notes";
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
      { ref: "a0", startsAt: 0, when: "Fri, Nov 13, 2:00 PM", status: "showed", contactRef: "c0", dealRef: "d0", leadName: "Priya Raman", source: "Referral", stage: "Call booked", brief: recent[1], past: true, noted: false },
      { ref: "a9", startsAt: 0, when: "Fri, Nov 13, 9:30 AM", status: "showed", contactRef: "c9", dealRef: "d9", leadName: "Marcus Hale", source: "Webinar", stage: "Proposal sent", brief: null, past: true, noted: true },
      { ref: "a1", startsAt: 1, when: "Sun, Nov 15, 3:00 PM", status: "confirmed", contactRef: "c1", dealRef: "d1", leadName: "Jordan Lee", source: "Facebook ads", stage: "Proposal sent", brief: recent[0], past: false, noted: false },
      { ref: "a2", startsAt: 2, when: "Mon, Nov 16, 10:30 AM", status: "booked", contactRef: "c2", dealRef: "d2", leadName: "Riley Park", source: "Referral", stage: "Call booked", brief: { id: "b2", leadName: "Riley Park", when: "Mon, Nov 16, 10:30 AM", state: "running", createdAt: 2 }, past: false, noted: false },
      { ref: "a3", startsAt: 3, when: "Tue, Nov 17, 4:00 PM", status: "booked", contactRef: "c3", dealRef: null, leadName: "Sam Okafor-Whitfield, Okafor Coaching Collective", source: "Webinar", stage: null, brief: null, past: false, noted: false },
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
      publicRead: {
        domain: "jordanco.com",
        from: "email",
        lines: [
          { text: "Jordan & Co. runs paid ads and booking funnels for dental clinics.", url: "https://jordanco.com/about" },
          { text: "It sells a monthly retainer and a one-off funnel build.", url: "https://jordanco.com/services" },
        ],
      },
      missing: first ? ["No earlier call with this lead is linked and shared with Dealmaker, so nothing is quoted from one.", "The Playbook's Offer folder is empty, so the brief names no package."] : [],
    },
  } as unknown as BriefData;
}

const notes: NotesData = {
  canWrite: true,
  outcomes: [
    { id: "nextCall", label: "Booked another call" },
    { id: "proposal", label: "Asked for a proposal" },
    { id: "thinking", label: "Wants time to think" },
    { id: "yes", label: "Said yes" },
    { id: "no", label: "Said no" },
    { id: "notFit", label: "Not a fit" },
    { id: "noShow", label: "Did not show" },
  ],
  objections: [
    { id: "o1", title: "Too expensive right now" },
    { id: "o2", title: "Need to talk to my partner" },
    { id: "o3", title: "Tried an agency before and it did not work" },
  ],
  notes: [
    {
      id: "n1",
      leadName: "Marcus Hale",
      contactRef: "c9",
      appointmentRef: "a9",
      outcome: "proposal",
      outcomeWords: "Asked for a proposal",
      nextStep: "Send the proposal with the clinic case study",
      nextStepDue: Date.UTC(2026, 10, 16),
      fit: [
        { field: "budget", value: "About $3k a month" },
        { field: "decider", value: "His co-founder, who was not on the call" },
      ],
      objections: ["Need to talk to my partner"],
      memo: { status: "done", seconds: 41, transcript: "He wants to start in January once his co-founder agrees. Asked twice about results for clinics like his.", problem: null },
      writtenBy: "Milo",
      createdAt: 1,
    },
  ],
} as unknown as NotesData;

export function CallsTabStory({ state, theme }: { state: string; theme: string }) {
  const [open, setOpen] = useState<string | null>(state === "brief" || state === "first" ? "b1" : null);
  return (
    <StoryFrame theme={theme} role={state === "viewer" ? "viewer" : "owner"}>
      {state === "intake" ? (
        <CallNotesForm lead={{ contactRef: "c0", dealRef: "d0", appointmentRef: "a0", leadName: "Priya Raman" }} options={notes} actions={{ saveNote: noop }} onDone={() => undefined} />
      ) : (
        <CallsView data={calls(state)} actions={{ request: noop, saveNote: noop }} notes={state === "viewer" ? { ...notes, canWrite: false } : notes} open={open ? brief(state) : null} onOpen={setOpen} />
      )}
    </StoryFrame>
  );
}
