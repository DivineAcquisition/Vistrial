import { describe, expect, it } from "vitest";

import { findBannedPhrases } from "@/lib/follow-up/banned";
import { DEFAULT_ANTHROPIC_DRAFT_MODEL } from "@/lib/follow-up/constants";
import { lengthRatio, wordEditDistance } from "@/lib/follow-up/edit-distance";
import { parseDraftModelOutput } from "@/lib/follow-up/parse";
import { DRAFT_SYSTEM_PROMPT, draftUserPrompt } from "@/lib/follow-up/prompt";
import { checkDraftQuality, type QualityInput } from "@/lib/follow-up/quality";
import { computeSendAt, isInQuietHours } from "@/lib/follow-up/quiet-hours";
import { boundedSequenceSteps, routeFollowUp } from "@/lib/follow-up/routing";
import { suggestionsFromEdits } from "@/lib/follow-up/suggestions";
import type { RoutingRule, VoiceProfile } from "@/lib/follow-up/types";

const transcript = `
Closer: What is the timeline looking like?
Maya: Realistically we are looking at after Q1.
Maya: The spouse has to be in the room.
Closer: Any budget range yet?
Maya: Let's park that. I need to see the Tuesday callback first.
`;

const voice: VoiceProfile = {
  formality: "casual",
  useContractions: true,
  useGreeting: false,
  useSignoff: false,
  greetingText: null,
  signoffText: null,
  smsMaxChars: 240,
  emailMaxChars: 900,
  emojiUsage: "never",
  bannedWords: [],
  examples: [],
};

const defaultRules: RoutingRule[] = [
  {
    priority: 10,
    branch: "no_show",
    enabled: true,
    match: { all: [{ field: "call_outcome", op: "eq", value: "no_show" }] },
    channel: "sms",
    sequenceSteps: [{ delayHours: 0 }, { delayHours: 24 }, { delayHours: 72 }],
  },
  {
    priority: 20,
    branch: "closed",
    enabled: true,
    match: {
      all: [
        { field: "call_outcome", op: "eq", value: "held" },
        { field: "next_step_text", op: "matches", value: "paid|onboard|welcome|closed|signed|enroll" },
      ],
    },
    channel: "email",
    sequenceSteps: [{ delayHours: 0, channel: "email" }],
  },
  {
    priority: 30,
    branch: "not_interested",
    enabled: true,
    match: {
      all: [{ field: "next_step_text", op: "matches", value: "not interested|no thanks" }],
    },
    channel: "sms",
    sequenceSteps: [{ delayHours: 0 }],
  },
  {
    priority: 40,
    branch: "objection_hold",
    enabled: true,
    match: { all: [{ field: "stated_objection_state", op: "eq", value: "present" }] },
    channel: "sms",
    sequenceSteps: [{ delayHours: 0 }, { delayHours: 48 }, { delayHours: 120 }],
  },
  {
    priority: 50,
    branch: "follow_up_scheduled",
    enabled: true,
    match: {
      all: [
        { field: "next_step_state", op: "eq", value: "present" },
        { field: "call_outcome", op: "in", value: ["held", "rescheduled"] },
      ],
    },
    channel: "sms",
    sequenceSteps: [{ delayHours: 0 }],
  },
  {
    priority: 60,
    branch: "ghost_risk",
    enabled: true,
    match: {
      all: [
        { field: "call_outcome", op: "in", value: ["held", "rescheduled"] },
        { field: "next_step_state", op: "neq", value: "present" },
      ],
    },
    channel: "sms",
    sequenceSteps: [{ delayHours: 0 }, { delayHours: 48 }, { delayHours: 120 }],
  },
];

const baseCtx = {
  callOutcome: "held" as const,
  nextStepState: "absent" as const,
  nextStepText: null as string | null,
  statedObjectionState: "absent" as const,
  leadStatus: "working" as const,
  noShowCount: 0,
};

function quality(over: Partial<QualityInput> = {}): QualityInput {
  return {
    body: 'You said "Realistically we are looking at after Q1." Tuesday at 3 still work?',
    channel: "sms",
    transcript,
    quotes: ["Realistically we are looking at after Q1."],
    statedObjection: null,
    nextStep: "Tuesday callback",
    nextStepState: "present",
    budgetState: "absent",
    timelineState: "present",
    decisionState: "absent",
    voice,
    ...over,
  };
}

describe("follow-up routing", () => {
  it("uses next step together with outcome, not outcome alone", () => {
    expect(routeFollowUp({ ...baseCtx, nextStepState: "absent" }, defaultRules)?.branch).toBe("ghost_risk");
    expect(
      routeFollowUp(
        { ...baseCtx, nextStepState: "present", nextStepText: "Tuesday callback at 3" },
        defaultRules
      )?.branch
    ).toBe("follow_up_scheduled");
    expect(
      routeFollowUp(
        {
          ...baseCtx,
          nextStepState: "present",
          nextStepText: "paid in full, start onboarding",
        },
        defaultRules
      )?.branch
    ).toBe("closed");
  });

  it("routes each default branch from a real outcome shape", () => {
    expect(routeFollowUp({ ...baseCtx, callOutcome: "no_show" }, defaultRules)?.branch).toBe("no_show");
    expect(
      routeFollowUp(
        { ...baseCtx, statedObjectionState: "present", nextStepState: "present", nextStepText: "think it over" },
        defaultRules
      )?.branch
    ).toBe("objection_hold");
    expect(
      routeFollowUp(
        { ...baseCtx, nextStepState: "present", nextStepText: "not interested, thanks" },
        defaultRules
      )?.branch
    ).toBe("not_interested");
    expect(routeFollowUp({ ...baseCtx, callOutcome: "cancelled" }, defaultRules)).toBeNull();
  });

  it("is data-driven: a different org profile can reroute the same call", () => {
    const ghostFirst: RoutingRule[] = [
      {
        priority: 1,
        branch: "ghost_risk",
        enabled: true,
        match: { all: [{ field: "call_outcome", op: "eq", value: "held" }] },
        channel: "email",
        sequenceSteps: [{ delayHours: 0 }],
      },
    ];
    const call = { ...baseCtx, nextStepState: "present" as const, nextStepText: "Tuesday callback at 3" };
    expect(routeFollowUp(call, defaultRules)?.branch).toBe("follow_up_scheduled");
    expect(routeFollowUp(call, ghostFirst)?.branch).toBe("ghost_risk");
    expect(routeFollowUp(call, ghostFirst)?.channel).toBe("email");
  });
});

describe("draft quality check", () => {
  it("is a function, not a model call, and rejects banned phrases", () => {
    const result = checkDraftQuality(
      quality({ body: "I hope this message finds you well. Just circling back." })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.some((item) => item.type === "banned_phrase")).toBe(true);
  });

  it("rejects a quote that is not verbatim in the transcript", () => {
    const result = checkDraftQuality(
      quality({ body: 'You said "We are definitely closing this quarter." Tuesday work?' })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.some((item) => item.type === "unverified_quote")).toBe(true);
  });

  it("rejects a budget mention when the extraction has no budget signal", () => {
    const result = checkDraftQuality(
      quality({
        body: 'You said "Realistically we are looking at after Q1." What is the budget?',
        budgetState: "absent",
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.some((item) => item.detail === "budget")).toBe(true);
  });

  it("rejects a draft with no load-bearing call-specific element", () => {
    const result = checkDraftQuality(
      quality({
        body: "Great chatting earlier. Let me know if you want to reconnect sometime.",
        quotes: [],
        nextStepState: "absent",
        nextStep: null,
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.some((item) => item.type === "no_lead_specific")).toBe(true);
  });

  it("rejects an invented commitment when no next step was captured", () => {
    const result = checkDraftQuality(
      quality({
        body: 'You said "Realistically we are looking at after Q1." You agreed to sign Friday.',
        nextStepState: "absent",
        nextStep: null,
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.some((item) => item.detail === "invented_commitment")).toBe(true);
  });

  it("rejects a greeting when the org profile excludes it", () => {
    const result = checkDraftQuality(quality({ body: "Hi Maya, Tuesday at 3 still work?" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.some((item) => item.type === "greeting")).toBe(true);
  });

  it("accepts a short SMS that quotes the prospect and never mentions absent budget", () => {
    const result = checkDraftQuality(quality());
    expect(result).toEqual({ ok: true });
  });
});

describe("banned constructions", () => {
  it("flags openings and corporate abstractions", () => {
    const hits = findBannedPhrases(
      "I wanted to reach out to leverage a seamless solution on your journey."
    );
    expect(hits.map((item) => item.phrase)).toEqual(
      expect.arrayContaining(["I wanted to reach out", "leverage", "seamless", "solution", "journey"])
    );
  });
});

describe("channel-native prompts", () => {
  const shared = {
    branch: "ghost_risk" as const,
    voice,
    noShowCount: 0,
    sequencePosition: 1,
    lead: { firstName: "Maya", source: "facebook", offerName: "Coaching" },
    extraction: {
      summary: "Held. Timeline after Q1. No next step.",
      statedObjection: null,
      statedObjectionState: "absent",
      budgetSignal: null,
      budgetState: "absent",
      timelineSignal: "after Q1",
      timelineState: "present",
      decisionProcess: null,
      decisionState: "absent",
      nextStep: null,
      nextStepState: "absent",
      quotes: [{ text: "Realistically we are looking at after Q1.", topic: "timeline" }],
    },
    priorOpenObjections: [] as string[],
    readiness: { total: 62, reasoning: null },
    priorTouches: [] as Array<{ at: string; channel: string; direction: string; type: string }>,
  };

  it("writes SMS and email as different structures, not truncations", () => {
    const sms = draftUserPrompt({ ...shared, channel: "sms" });
    const email = draftUserPrompt({ ...shared, channel: "email" });
    expect(sms).toContain("Channel: SMS");
    expect(sms).toContain("No greeting. No sign-off.");
    expect(email).toContain("Channel: email");
    expect(email).toContain("Write this natively as an email, not as an expanded SMS.");
    expect(sms).toContain("not as a truncated email");
    expect(email).toContain("not as an expanded SMS");
    expect(DRAFT_SYSTEM_PROMPT).toContain("Never auto-approve or auto-send.");
  });

  it("tells the model not to mention budget when the signal is absent", () => {
    const sms = draftUserPrompt({ ...shared, channel: "sms" });
    expect(sms).toContain("DO NOT MENTION BUDGET");
    expect(sms).toContain("DO NOT ASSERT A COMMITMENT");
  });

  it("shifts toward client voice when real examples are present", () => {
    const withExamples = draftUserPrompt({
      ...shared,
      channel: "sms",
      voice: {
        ...voice,
        examples: [
          { body: "Yo — Tuesday still good on your end?", channel: "sms", addedAt: "2026-08-20T00:00:00.000Z" },
          { body: "Locked. See you then.", channel: "sms", addedAt: "2026-08-20T00:00:00.000Z" },
        ],
      },
    });
    const without = draftUserPrompt({ ...shared, channel: "sms" });
    expect(withExamples).toContain("Yo — Tuesday still good on your end?");
    expect(without).toContain("No client examples are on file");
    expect(withExamples).not.toContain("No client examples are on file");
  });
});

describe("draft parse and model tier", () => {
  it("records SMS without a subject and email with one", () => {
    expect(
      parseDraftModelOutput('{"body":"Tuesday still work?","subject":null,"quotes_used":[]}', "sms").subject
    ).toBeNull();
    expect(
      parseDraftModelOutput(
        '{"body":"Tuesday still work?","subject":"Tuesday callback","quotes_used":[]}',
        "email"
      ).subject
    ).toBe("Tuesday callback");
  });

  it("does not use a cheap model tier for drafting", () => {
    expect(DEFAULT_ANTHROPIC_DRAFT_MODEL).not.toMatch(/haiku/i);
    expect(DEFAULT_ANTHROPIC_DRAFT_MODEL).toMatch(/opus/i);
  });
});

describe("quiet hours", () => {
  it("holds a send in the lead timezone overnight window and is on by default logic", () => {
    const late = new Date("2026-08-20T02:00:00.000Z");
    expect(isInQuietHours(late, "America/New_York", "21:00", "08:00")).toBe(true);
    const sendAt = computeSendAt({
      now: late,
      timeZone: "America/New_York",
      enabled: true,
      startHm: "21:00",
      endHm: "08:00",
    });
    expect(isInQuietHours(sendAt, "America/New_York", "21:00", "08:00")).toBe(false);
    expect(
      computeSendAt({
        now: late,
        timeZone: "America/New_York",
        enabled: false,
        startHm: "21:00",
        endHm: "08:00",
      }).toISOString()
    ).toBe(late.toISOString());
  });
});

describe("edit distance and voice suggestions", () => {
  it("measures word-level distance between generated and sent copy", () => {
    expect(wordEditDistance("lock tuesday at three", "lock tuesday at 3")).toBe(1);
    expect(lengthRatio("abcd", "ab")).toBe(0.5);
  });

  it("surfaces consistent shorten/drop patterns without auto-applying them", () => {
    const pairs = Array.from({ length: 6 }, () => ({
      generated: "Please would you kindly confirm regarding Tuesday at your earliest.",
      sent: "Tuesday still good?",
    }));
    const suggestions = suggestionsFromEdits(pairs);
    expect(suggestions.some((item) => item.kind === "shorter")).toBe(true);
    expect(suggestions.some((item) => item.kind === "less_formal")).toBe(true);
  });
});

describe("bounded sequences", () => {
  it("caps length and never returns an unbounded list", () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ delayHours: i }));
    expect(boundedSequenceSteps(long, 3)).toHaveLength(3);
    expect(boundedSequenceSteps(long, 99)).toHaveLength(8);
    expect(boundedSequenceSteps([], 3)).toEqual([{ delayHours: 0, channel: undefined }]);
  });
});
