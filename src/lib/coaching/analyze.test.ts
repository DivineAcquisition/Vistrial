import { describe, expect, it } from "vitest";

import {
  analyzeCall,
  analyzedCallHasForbiddenKeys,
  classifyObjectionHandling,
  classifyQuestion,
  parseTurns,
} from "@/lib/coaching/analyze";
import { CALL_QUALITY_MEASURES, CALL_QUALITY_MEASURE_SURFACES, FORBIDDEN_MEASURE_PATTERNS } from "@/lib/coaching/catalog";

/**
 * A discovery call I read before writing assertions.
 *
 * The setter asks who decides, what is painful, when they want it solved, and
 * what they planned to invest. The prospect raises price. The setter restates
 * it and asks what would need to be true. They book Thursday at 2pm.
 */
const ADDRESSED_DISCOVERY = `
Setter: Hi Jordan, thanks for jumping on. Before we go too far, who else is involved in deciding this?
Prospect: Just me, I'm the owner.
Setter: What's been the hardest part of keeping clients from dropping off?
Prospect: We lose them after month two and it's costing us about four grand a month.
Setter: When do you want this solved by?
Prospect: End of this quarter.
Setter: What range had you planned to invest?
Prospect: Around ten thousand if it actually works.
Prospect: This is more than I expected to spend.
Setter: What I hear is the number is the hang-up. What would need to be true for ten thousand to feel like a fit rather than a stretch?
Prospect: If we recoup it in 90 days.
Setter: Let's do a working session Thursday at 2pm to map that 90-day recoup. Does Thursday at 2 work?
Prospect: Yes, Thursday at 2.
`;

/**
 * A close I read before writing assertions.
 *
 * The closer delivers a long pitch, never asks who decides or what hurts, and
 * when the prospect says they need to talk to their wife the closer says
 * "anyway" and offers a brochure. No time is set.
 */
const DEFLECTED_MONOLOGUE = `
Closer: Let me tell you about the program. We have twelve modules and a community and weekly calls and a guarantee and the reason this works is the system and I want to walk you through every piece so you see the value. Module one is positioning. Module two is ads. Module three is the closer track. Module four is the fulfillment OS. Module five is hiring. I could keep going because there is a lot here and people who skip this walkthrough miss why the price makes sense.
Prospect: I need to talk to my wife.
Closer: Anyway the next module is about ads. You'll love it. So yeah think it over and we can send the brochure.
`;

const UNLABELED = `
Thanks for jumping on. What is the main problem right now? I can send over some times later this week.
`;

describe("call quality analyzer", () => {
  it("attributes labeled speakers and does not invent a talk ratio on unlabeled text", () => {
    const labeled = parseTurns(ADDRESSED_DISCOVERY);
    expect(labeled.some((turn) => turn.speaker === "rep")).toBe(true);
    expect(labeled.some((turn) => turn.speaker === "prospect")).toBe(true);

    const unlabeled = analyzeCall({
      transcript: UNLABELED,
      durationSeconds: 120,
      typicalDurationSeconds: null,
      extraction: null,
      objections: [],
      priorOpenObjections: [],
      briefOpenedBeforeCall: false,
      painScoredOnThisCall: false,
    });
    expect(unlabeled.speakersAttributed).toBe(false);
    expect(unlabeled.talkRatioRep).toBeNull();
    expect(unlabeled.longestRepMonologueWords).toBeNull();
  });

  it("counts open and closed questions the way the discovery call actually reads", () => {
    expect(classifyQuestion("Who else is involved in deciding this?")).toBe("open");
    expect(classifyQuestion("What's been the hardest part of keeping clients from dropping off?")).toBe(
      "open"
    );
    expect(classifyQuestion("Does Thursday at 2 work?")).toBe("closed");

    const result = analyzeCall({
      transcript: ADDRESSED_DISCOVERY,
      durationSeconds: 840,
      typicalDurationSeconds: 900,
      extraction: {
        timelineState: "present",
        budgetState: "present",
        decisionState: "present",
        nextStepState: "present",
        nextStepAgreed: "Thursday at 2pm working session",
      },
      objections: [
        {
          id: "obj-price",
          type: "price",
          verbatim: "This is more than I expected to spend.",
        },
      ],
      priorOpenObjections: [
        {
          id: "obj-price",
          type: "price",
          verbatim: "This is more than I expected to spend.",
        },
      ],
      briefOpenedBeforeCall: true,
      painScoredOnThisCall: false,
    });

    expect(result.questionCount).toBeGreaterThanOrEqual(5);
    expect(result.openQuestionCount).toBeGreaterThan(result.closedQuestionCount);
    expect(result.discoveryAuthority).toBe(true);
    expect(result.discoveryPain).toBe(true);
    expect(result.discoveryTimeline).toBe(true);
    expect(result.discoveryBudget).toBe(true);
    expect(result.commitmentClarity).toBe("specific");
    expect(result.nextStepAgreed).toBe(true);
    expect(result.objections).toHaveLength(1);
    expect(result.objections[0]?.handling).toBe("addressed");
    expect(result.openObjectionsAddressedN).toBe(1);
    expect(result.briefOpenedBeforeCall).toBe(true);
    expect(result.talkRatioRep).not.toBeNull();
    expect(analyzedCallHasForbiddenKeys(result)).toBe(false);
  });

  it("marks a spouse objection as deflected when the closer changes the subject", () => {
    const result = analyzeCall({
      transcript: DEFLECTED_MONOLOGUE,
      durationSeconds: 600,
      typicalDurationSeconds: 900,
      extraction: {
        timelineState: "absent",
        budgetState: "absent",
        decisionState: "absent",
        nextStepState: "absent",
        nextStepAgreed: null,
      },
      objections: [
        {
          id: "obj-spouse",
          type: "spouse_partner",
          verbatim: "I need to talk to my wife.",
        },
      ],
      priorOpenObjections: [
        {
          id: "obj-spouse",
          type: "spouse_partner",
          verbatim: "I need to talk to my wife.",
        },
      ],
      briefOpenedBeforeCall: false,
      painScoredOnThisCall: false,
    });

    expect(result.objections[0]?.handling).toBe("deflected");
    expect(result.discoveryAuthority).toBe(false);
    expect(result.discoveryPain).toBe(false);
    expect(result.commitmentClarity).toBe("none");
    expect(result.briefOpenedBeforeCall).toBe(false);
    expect(result.openObjectionsAddressedN).toBe(0);
    expect(result.longestRepMonologueWords).toBeGreaterThan(40);
    expect(result.talkRatioRep).not.toBeNull();
    expect(result.talkRatioRep ?? 0).toBeGreaterThan(0.6);
  });

  it("marks an objection ignored when the rep never returns to it", () => {
    const transcript = `
Setter: How did you hear about us?
Prospect: The price is too high.
Setter: We have twelve modules. I will send the calendar link.
`;
    const handling = classifyObjectionHandling(parseTurns(transcript), {
      id: "obj-1",
      type: "price",
      verbatim: "The price is too high.",
    });
    expect(handling.handling).toBe("ignored");
  });
});

describe("measure catalog", () => {
  it("does not include personality, enthusiasm, ranking, or grades", () => {
    const blob = JSON.stringify(CALL_QUALITY_MEASURES);
    for (const pattern of FORBIDDEN_MEASURE_PATTERNS) {
      expect(blob).not.toMatch(pattern);
    }
  });

  it("lists a surface on the rep view for every computed measure", () => {
    for (const item of CALL_QUALITY_MEASURES) {
      expect(CALL_QUALITY_MEASURE_SURFACES[item.key]).toBeTruthy();
    }
    expect(Object.keys(CALL_QUALITY_MEASURE_SURFACES)).toHaveLength(CALL_QUALITY_MEASURES.length);
  });
});
