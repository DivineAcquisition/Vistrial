import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { emptyExtraction } from "@/lib/extraction/parse";
import { checkDraftQuality } from "@/lib/follow-up/quality";
import { checkAgentPlanDeterministic } from "@/lib/verification/agent-plan";
import { correctAgentResponse } from "@/lib/verification/agent-response";
import {
  AGENT_PLAN_VERIFIER_SYSTEM,
  agentPlanVerifierUser,
} from "@/lib/verification/agent-plan";
import { VERIFICATION_MAX_ATTEMPTS } from "@/lib/verification/constants";
import { DRAFT_VERIFIER_SYSTEM } from "@/lib/verification/draft-det";
import { runBoundedVerification } from "@/lib/verification/engine";
import { checkExtractionDeterministic, EXTRACTION_VERIFIER_SYSTEM, extractionVerifierUser } from "@/lib/verification/extraction-det";
import { parseVerifierResponse } from "@/lib/verification/faults";
import { injectedSuitePassed, runInjectedFaultSuite } from "@/lib/verification/injected";
import { checkReportingHeadlines, parseHeadlineRate } from "@/lib/verification/reporting";
import { shouldAlertInjectedCatch, shouldAlertPassRate } from "@/lib/verification/metrics";

const TRANSCRIPT = `Setter: We'll lock you in today for twelve thousand.
Maya: Realistically we are looking at after Q1.
Maya: The price is the wall.
Maya: I need to talk to my partner before anything is booked.`;

describe("verification engine", () => {
  it("caps at two attempts", () => {
    expect(VERIFICATION_MAX_ATTEMPTS).toBe(2);
  });

  it("regenerates a deterministic failure without calling the verifier", async () => {
    let modelCalls = 0;
    let generations = 0;
    const result = await runBoundedVerification({
      generate: async () => {
        generations += 1;
        return generations === 1 ? "bad" : "good";
      },
      deterministic: (output) =>
        output === "good" ? { ok: true, faults: [] } : { ok: false, faults: [{ code: "x", where: "body", what: "bad" }] },
      modelVerify: async () => {
        modelCalls += 1;
        return {
          invoked: true,
          faults: [],
          wouldEmbarrass: null,
          model: "test",
          inputTokens: 1,
          outputTokens: 1,
          skippedReason: null,
        };
      },
    });
    expect(generations).toBe(2);
    expect(modelCalls).toBe(1);
    expect(result.finalState).toBe("passed");
    expect(result.retryHappened).toBe(true);
  });

  it("does not loop a third time when the second attempt still fails", async () => {
    let generations = 0;
    const result = await runBoundedVerification({
      generate: async () => {
        generations += 1;
        return "bad";
      },
      deterministic: () => ({ ok: false, faults: [{ code: "x", where: "body", what: "still bad" }] }),
      modelVerify: async () => {
        throw new Error("verifier must not run after a deterministic failure");
      },
    });
    expect(generations).toBe(2);
    expect(result.finalState).toBe("flagged");
    expect(result.stageCaught).toBe("deterministic");
    expect(result.modelInvoked).toBe(false);
  });
});

describe("extraction deterministic checks", () => {
  it("catches a fabricated quote", () => {
    const result = checkExtractionDeterministic({
      extraction: emptyExtraction(),
      transcript: TRANSCRIPT,
      rawQuotes: [{ text: "I will wire two million tomorrow.", topic: "budget" }],
    });
    expect(result.faults.some((item) => item.code === "fabricated_quote")).toBe(true);
  });

  it("catches a swapped speaker attribution", () => {
    const result = checkExtractionDeterministic({
      extraction: {
        ...emptyExtraction(),
        quotes: [{ text: "We'll lock you in today for twelve thousand.", topic: "commitment" }],
      },
      transcript: TRANSCRIPT,
    });
    expect(result.faults.some((item) => item.code === "wrong_speaker")).toBe(true);
  });

  it("catches an unsupported commitment in the summary", () => {
    const result = checkExtractionDeterministic({
      extraction: {
        ...emptyExtraction(),
        summary: "Maya committed to twelve thousand this week.",
      },
      transcript: TRANSCRIPT,
    });
    expect(result.faults.some((item) => item.code === "unsupported_claim")).toBe(true);
  });

  it("catches a missed objection", () => {
    const result = checkExtractionDeterministic({
      extraction: emptyExtraction(),
      transcript: TRANSCRIPT,
    });
    expect(result.faults.some((item) => item.code === "missed_objection")).toBe(true);
  });
});

describe("draft deterministic checks stay as built", () => {
  it("still flags an invented commitment through checkDraftQuality", () => {
    const result = checkDraftQuality({
      body: "You booked Thursday and you committed to the package.",
      subject: null,
      channel: "sms",
      transcript: TRANSCRIPT,
      quotes: ["The price is the wall."],
      statedObjection: "The price is the wall",
      nextStep: null,
      nextStepState: "absent",
      budgetState: "absent",
      timelineState: "present",
      decisionState: "present",
      voice: {
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
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.some((item) => item.detail === "invented_commitment")).toBe(true);
  });
});

describe("injected faults", () => {
  it("catches each required fault type without a model call", () => {
    const results = runInjectedFaultSuite();
    expect(results.map((item) => item.type)).toEqual([
      "fabricated_quote",
      "wrong_speaker",
      "unsupported_claim",
      "invented_commitment",
    ]);
    expect(injectedSuitePassed(results)).toBe(true);
    expect(results.every((item) => item.stage === "deterministic")).toBe(true);
  });
});

describe("verifier framing", () => {
  it("asks for faults, not approval, and never includes generator reasoning", () => {
    const extractionUser = extractionVerifierUser(TRANSCRIPT, '{"summary":"x"}');
    expect(EXTRACTION_VERIFIER_SYSTEM).toMatch(/find faults/i);
    expect(EXTRACTION_VERIFIER_SYSTEM).toMatch(/do not approve/i);
    expect(EXTRACTION_VERIFIER_SYSTEM).not.toMatch(/whether this is good|is this (?:output )?good/i);
    expect(extractionUser).not.toMatch(/reasoning|chain of thought|here is why/i);
    expect(DRAFT_VERIFIER_SYSTEM).toMatch(/embarrass/);
    expect(DRAFT_VERIFIER_SYSTEM).toMatch(/never sends/);
    expect(AGENT_PLAN_VERIFIER_SYSTEM).toMatch(/find faults/i);
    expect(agentPlanVerifierUser("reassign Maya", "{}")).not.toMatch(/reasoning/i);
  });

  it("treats would_embarrass as a fault that changes the outcome", () => {
    const parsed = parseVerifierResponse(
      '{"faults":[],"would_embarrass":true,"embarrass_reason":"Presumes they already bought."}'
    );
    expect(parsed.wouldEmbarrass).toBe(true);
    expect(parsed.faults.some((item) => item.code === "would_embarrass")).toBe(true);
  });

  it("does not treat empty faults as praise — it is just no faults found", () => {
    const parsed = parseVerifierResponse('{"faults":[]}');
    expect(parsed.faults).toEqual([]);
  });
});

describe("agent plan and response", () => {
  it("flags over-broad scope before confirmation", () => {
    const result = checkAgentPlanDeterministic({
      writeKind: "assign",
      recordCount: 12,
      cap: 10,
      records: Array.from({ length: 12 }, (_, i) => ({ id: `id-${i}`, leadId: `id-${i}`, label: "x" })),
      permissionDeniedIds: [],
    });
    expect(result.ok).toBe(false);
    expect(result.faults.some((item) => item.code === "over_broad")).toBe(true);
  });

  it("strips a number no tool returned before display", () => {
    const result = correctAgentResponse({
      response: "There are 47 ready leads. The queue is moving.",
      steps: [{ seq: 1, toolName: "search_leads", summary: "Found 3 leads.", result: { count: 3 } }],
    });
    expect(result.ok).toBe(false);
    expect(result.faults.some((item) => item.code === "unsupported_number")).toBe(true);
    expect(result.corrected).not.toMatch(/47/);
    expect(result.corrected).toMatch(/queue is moving/i);
  });
});

describe("cost, pass rate, and send path", () => {
  it("alerts when model-invoked pass rate approaches 100%", () => {
    expect(shouldAlertPassRate(19, 0)).toBe(false);
    expect(shouldAlertPassRate(20, 0)).toBe(true);
    expect(shouldAlertPassRate(18, 2)).toBe(false);
  });

  it("alerts when injected-fault catch rate is poor", () => {
    expect(shouldAlertInjectedCatch(1, 4)).toBe(true);
    expect(shouldAlertInjectedCatch(4, 4)).toBe(false);
  });

  it("verification modules never dispatch or approve a draft", () => {
    const dir = path.join(process.cwd(), "src/lib/verification");
    const files = [
      "engine.ts",
      "draft-det.ts",
      "model.ts",
      "record.ts",
      "agent-verify.ts",
      "agent-plan.ts",
    ];
    for (const file of files) {
      const text = readFileSync(path.join(dir, file), "utf8");
      expect(text).not.toMatch(/dispatchOutboundMessage/);
      expect(text).not.toMatch(/approveFollowUp/);
      expect(text).not.toMatch(/status:\s*"approved"/);
    }
    const generate = readFileSync(path.join(process.cwd(), "src/lib/follow-up/generate.ts"), "utf8");
    expect(generate).not.toMatch(/dispatchOutboundMessage/);
    expect(generate).toMatch(/status:\s*"pending"/);
    expect(generate).toMatch(/approved_at: null/);
  });

  it("DA verification toggles run as the signed-in admin so auth.uid() is present", () => {
    const text = readFileSync(path.join(process.cwd(), "src/app/app/ops/actions.ts"), "utf8");
    expect(text).not.toMatch(/getSupabaseAdmin\(\)\.rpc\("set_verification_task_enabled"/);
    expect(text).not.toMatch(/getSupabaseAdmin\(\)\.rpc\("submit_verification_sample_audit"/);
    expect(text).toMatch(/createClient\(\)[\s\S]*set_verification_task_enabled/);
    expect(text).toMatch(/createClient\(\)[\s\S]*submit_verification_sample_audit/);
  });
});

describe("reporting arithmetic is code", () => {
  it("blocks a headline mismatch", () => {
    const result = checkReportingHeadlines({
      displayed: { k: 10, n: 100, perHundred: 10, pct: null, tooSmall: false },
      recomputed: { k: 9, n: 100, perHundred: 9, pct: null, tooSmall: false },
      integrity: { closedWonWithoutRevenue: 0, phantomTouches: 0, scoreDrift: 0 },
    });
    expect(result.ok).toBe(false);
    expect(result.faults.some((item) => item.code === "headline_mismatch")).toBe(true);
  });

  it("blocks closed-won without revenue", () => {
    const result = checkReportingHeadlines({
      displayed: parseHeadlineRate({ k: 1, n: 40, per_hundred: 2.5, too_small: false }),
      recomputed: parseHeadlineRate({ k: 1, n: 40, per_hundred: 2.5, too_small: false }),
      integrity: { closedWonWithoutRevenue: 2, phantomTouches: 0, scoreDrift: 0 },
    });
    expect(result.ok).toBe(false);
    expect(result.faults.some((item) => item.where === "closed_won")).toBe(true);
  });
});
