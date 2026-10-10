import { NOTIFICATION_HOURLY_CAP } from "@/lib/notifications/constants";
import type { HelpTopic } from "@/lib/portal/requests";

export type HelpAnswer = { topic: HelpTopic; question: string; answer: string[]; link?: { label: string; href: string } };

/** Short answers to what people ask most. Anything else goes to the team through the form. */
export const HELP_ANSWERS: HelpAnswer[] = [
  {
    topic: "leads",
    question: "Does Vistrial message my leads?",
    answer: [
      "No. Vistrial watches your leads and drafts follow-ups, and a person on your team approves each one.",
      "Approved messages go out the way you already send them. Vistrial never writes to your CRM.",
    ],
  },
  {
    topic: "results",
    question: "Why does a number say there is not enough data yet?",
    answer: [
      "Rates and averages based on a handful of leads swing a lot, so Vistrial says so instead of showing a figure you might act on.",
      "Each card explains how it is counted. Open it to see the leads behind it.",
    ],
    link: { label: "Open Results", href: "/app/results" },
  },
  {
    topic: "results",
    question: "Why is revenue or cost per booked call missing?",
    answer: [
      "Those appear only once payments or ad spend are connected. Vistrial does not show a zero for something it cannot see.",
    ],
    link: { label: "See connections", href: "/app/settings/connections" },
  },
  {
    topic: "connections",
    question: "The CRM connection says it needs reconnecting.",
    answer: [
      "Your CRM stopped accepting Vistrial's access, usually after a password change or a removed app. New leads are not arriving until it is fixed.",
      "Reconnect it from Connections. Nothing that was already in Vistrial is lost.",
    ],
    link: { label: "Open Connections", href: "/app/settings/connections" },
  },
  {
    topic: "team",
    question: "What can each person see?",
    answer: [
      "Owners see everything, including billing. Members see results and leads; your team can let a Member see money or export.",
      "Setters and closers see the leads assigned to them and log what happened on each call.",
    ],
    link: { label: "Open People", href: "/app/settings/members" },
  },
  {
    topic: "team",
    question: "Why did I not get an email about every alert?",
    answer: [
      `At most ${NOTIFICATION_HOURLY_CAP} alerts reach you in an hour, and anything that can wait is held outside your working hours. Every alert still appears on your Notifications page.`,
    ],
    link: { label: "Notification settings", href: "/app/settings/notifications" },
  },
  {
    topic: "onboarding",
    question: "What is left before we go live?",
    answer: ["The setup page shows each step, who it is waiting on, and what to do next."],
    link: { label: "See setup progress", href: "/app/onboarding/progress" },
  },
  {
    topic: "privacy",
    question: "Can we get a copy of our data, or have it deleted?",
    answer: ["Yes. An owner can ask from Privacy. Your team handles it and replies by email."],
    link: { label: "Open Privacy", href: "/app/settings/privacy" },
  },
];
