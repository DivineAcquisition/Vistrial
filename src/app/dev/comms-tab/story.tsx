"use client";

import { CommsView, type CommsData } from "@/components/work/comms-tab";
import { MESSAGE_KINDS, MESSAGE_KIND_LABEL } from "../../../../convex/lib/dealmaker/autonomy";

import { StoryFrame } from "../work-tabs/story-frame";

const NOW = Date.UTC(2026, 10, 14, 15);
const noop = async () => undefined;

type Item = CommsData["lanes"][number]["items"][number];
function item(id: string, lane: Item["lane"], input: Partial<Item>): Item {
  return {
    id: id as Item["id"],
    lane,
    contactRef: `c-${id}`,
    leadName: "Jordan Lee",
    dealRef: "1038",
    kind: "followUp",
    kindLabel: MESSAGE_KIND_LABEL.followUp,
    channel: "sms",
    title: null,
    body: "",
    why: "Written by a person.",
    byDealmaker: false,
    note: null,
    updatedAt: NOW,
    ...input,
  };
}

/** A coaching agency's messages to its leads. Sample data. */
const items: Item[] = [
  item("1", "drafted", {
    leadName: "Jordan Lee",
    kind: "answer",
    kindLabel: MESSAGE_KIND_LABEL.answer,
    body: "Thanks Jordan, good question. The programme runs twelve weeks and we meet weekly. Want to pick a time to go through it?",
    why: "The lead wrote last, so the reply is ours.",
    byDealmaker: true,
  }),
  item("2", "drafted", {
    leadName: "Sam Ray",
    kind: "firstMessage",
    kindLabel: MESSAGE_KIND_LABEL.firstMessage,
    channel: "email",
    title: "Your enquiry with Northlight",
    body: "Hi Sam,\n\nThanks for getting in touch. When suits you for a short call this week?\n\nNora",
    why: "A new lead nobody has written to yet.",
    byDealmaker: true,
  }),
  item("3", "held", {
    leadName: "Ana Diaz",
    kind: "followUp",
    body: "Checking in on the proposal. Our package is $4,500 a month.",
    note: "It names a price, so a person decides.",
    why: "Written by a person.",
  }),
  item("4", "waiting", {
    leadName: "Riley Park",
    kind: "deliverPromised",
    kindLabel: MESSAGE_KIND_LABEL.deliverPromised,
    body: "Here is the Harbor case study I promised: it covers the first ninety days.",
    why: "Something we promised is due.",
    byDealmaker: true,
  }),
  item("5", "sent", {
    leadName: "Lee Park",
    kind: "reminder",
    kindLabel: MESSAGE_KIND_LABEL.reminder,
    body: "See you at 3pm today for our call.",
    why: "A call is booked for today.",
    byDealmaker: true,
  }),
  item("6", "failed", {
    leadName: "Alex Kim",
    body: "Hi Alex, any thoughts on the plan?",
    note: "Quiet hours at the lead's time, so nothing was sent.",
  }),
];

function data(messaging: boolean): CommsData {
  return {
    connected: true,
    messaging,
    limits: { sms: 640, email: 5000, title: 150 },
    leads: [
      {
        contactRef: "c-1",
        dealRef: "1038",
        name: "Jordan Lee",
        sms: true,
        email: false,
      },
      {
        contactRef: "c-2",
        dealRef: "1042",
        name: "Sam Ray",
        sms: false,
        email: true,
      },
      {
        contactRef: "c-3",
        dealRef: "1031",
        name: "Ana Diaz",
        sms: true,
        email: true,
      },
    ],
    lanes: (["drafted", "held", "waiting", "sent", "failed"] as const).map((id) => ({
      id,
      label: {
        drafted: "Drafted",
        held: "Held",
        waiting: "Waiting for approval",
        sent: "Sent",
        failed: "Not sent",
      }[id],
      items: items.filter((row) => row.lane === id),
    })),
    kinds: MESSAGE_KINDS.map((id) => ({ id, label: MESSAGE_KIND_LABEL[id] })),
    canEdit: true,
  };
}

export function CommsTabStory({ messaging, theme }: { messaging: boolean; theme: string }) {
  return (
    <StoryFrame theme={theme} role="owner">
      <CommsView
        data={data(messaging)}
        maxCredits={12}
        editor
        actions={{
          create: noop,
          update: noop,
          discard: noop,
          submit: async () => ({
            outcome: "proposed",
            reason: "A person approves it.",
          }),
          draftFollowUps: async () => ({ runId: "story" }),
        }}
      />
    </StoryFrame>
  );
}
