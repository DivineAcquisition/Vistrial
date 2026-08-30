import { describe, expect, it } from "vitest";

import { FIRST_RUN } from "@/lib/first-run";
import { FOLLOW_UP_BRANCH_LABELS } from "@/lib/follow-up/labels";
import { EXTRACTION_STATUS_LABELS, LEAD_STATUS_LABELS, LEAD_TRACK_LABELS } from "@/lib/leads/labels";
import { ADVANCED_SETTINGS_PAGES } from "@/lib/navigation";
import { EVENT_LABELS } from "@/lib/notifications/labels";
import { FACTOR_TITLE, READINESS, WORDS } from "@/lib/vocabulary";

const BANNED = [
  /readiness/i,
  /\btrack\b/i,
  /speed.to.lead/i,
  /\bghost/i,
  /\bdispatch/i,
  /extraction/i,
  /\bcohort/i,
  /\bholdout/i,
  /\bbreach/i,
  /HighLevel/i,
  /\bGHL\b/,
];

function values(record: Record<string, string>): string[] {
  return Object.values(record);
}

describe("user-facing labels stay in plain language", () => {
  it("keeps jargon out of the words people read", () => {
    const blob = [
      ...values(READINESS),
      ...values(WORDS),
      ...values(FACTOR_TITLE),
      ...values(LEAD_STATUS_LABELS),
      ...values(LEAD_TRACK_LABELS),
      ...values(EXTRACTION_STATUS_LABELS),
      ...values(EVENT_LABELS),
      ...values(FOLLOW_UP_BRANCH_LABELS),
      ...ADVANCED_SETTINGS_PAGES.map((page) => `${page.label} ${page.description}`),
      ...Object.values(FIRST_RUN).flatMap((copy) => [copy.title, copy.body]),
    ].join("\n");

    for (const pattern of BANNED) {
      expect(blob, `still contains ${pattern}`).not.toMatch(pattern);
    }
  });
});
