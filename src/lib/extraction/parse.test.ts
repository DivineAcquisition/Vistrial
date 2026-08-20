import { describe, expect, it, vi } from "vitest";

import { keepVerbatimQuotes, quoteAppearsInTranscript } from "@/lib/transcripts/quotes";
import { parseExtraction } from "@/lib/extraction/parse";
import { callScoreReasoning } from "@/lib/scoring/call-reason";
import { overlayCallFactors } from "@/lib/scoring/events";
import { payloadWithoutAudio } from "@/lib/transcripts/shape";
import { transcriptLog, logHasForbiddenContent } from "@/lib/transcripts/log";

const transcript = `
Setter: Thanks for jumping on.
Maya: Realistically we are looking at after Q1.
Maya: Budget is not something I can speak to yet.
Maya: My partner has to be in the room for this.
`;

describe("verbatim quotes", () => {
  it("keeps quotes that appear in the transcript and drops paraphrases", () => {
    const kept = keepVerbatimQuotes(
      [
        { text: "Realistically we are looking at after Q1.", topic: "timeline" },
        { text: "They might have money later this year.", topic: "budget" },
      ],
      transcript
    );
    expect(kept).toEqual([{ text: "Realistically we are looking at after Q1.", topic: "timeline" }]);
    expect(quoteAppearsInTranscript("not in the call", transcript)).toBe(false);
  });
});

describe("extraction parse", () => {
  it("stores absent budget when the model left it absent, even if context tempts a guess", () => {
    const parsed = parseExtraction(
      {
        summary: "Short intro. Timeline after Q1. Partner must join.",
        budget_signal: { state: "absent", text: "probably 15k based on the offer" },
        timeline_signal: { state: "present", text: "after Q1" },
        decision_process: { state: "present", text: "partner has to be in the room" },
        quotes: [
          { text: "Realistically we are looking at after Q1.", topic: "timeline" },
          { text: "I can do 15k easy", topic: "budget" },
        ],
        objections: [
          { type: "spouse_partner", verbatim: "My partner has to be in the room for this." },
          { type: "price", verbatim: "That price is way too high." },
        ],
      },
      transcript
    );
    expect(parsed.budgetSignal).toEqual({ state: "absent", text: null });
    expect(parsed.timelineSignal.state).toBe("present");
    expect(parsed.quotes).toHaveLength(1);
    expect(parsed.objections).toEqual([
      { type: "spouse_partner", verbatim: "My partner has to be in the room for this." },
    ]);
  });

  it("renders absent and unclear as different states", () => {
    const parsed = parseExtraction(
      {
        budget_signal: { state: "unclear", text: "she mentioned cost but no number" },
        timeline_signal: { state: "absent", text: null },
      },
      "hello this call never got to budget or timing at all really chatting"
    );
    expect(parsed.budgetSignal.state).toBe("unclear");
    expect(parsed.timelineSignal.state).toBe("absent");
  });

  it("turns a two-minute empty call into a near-empty extraction", () => {
    const parsed = parseExtraction(
      {
        summary: null,
        budget_signal: { state: "absent", text: null },
        timeline_signal: { state: "absent", text: null },
        quotes: [{ text: "They are ready to buy this week", topic: "intent" }],
        objections: [],
      },
      "Setter: You there?\nProspect: uh\nSetter: I'll reschedule."
    );
    expect(parsed.quotes).toEqual([]);
    expect(parsed.budgetSignal.state).toBe("absent");
    expect(parsed.summary).toBeNull();
  });

  it("does not keep invented content from a garbled transcript", () => {
    const garbled = "rrrr [inaudible] kkhh ... mm  [unclear]";
    const parsed = parseExtraction(
      {
        summary: "Prospect committed 20k this month",
        budget_signal: { state: "present", text: "20k this month" },
        quotes: [{ text: "I'll wire 20k this month", topic: "budget" }],
      },
      garbled
    );
    expect(parsed.quotes).toEqual([]);
    expect(parsed.budgetSignal.state).toBe("absent");
    expect(parsed.budgetSignal.text).toBeNull();
  });
});

describe("call re-score overlay", () => {
  it("lets call evidence replace a conflicting form answer and names the call", () => {
    const merged = overlayCallFactors(
      { timeline: 80, investment_capacity: 70, decision_authority: 60, pain_severity: 50 },
      { timeline: 40, investment_capacity: null, decision_authority: null, pain_severity: null }
    );
    expect(merged.timeline).toBe(40);
    expect(merged.investment_capacity).toBe(70);
    const reasoning = callScoreReasoning({
      callId: "call-99",
      callType: "triage",
      callAt: "2026-03-12T15:00:00.000Z",
      explanation: "Total 55.",
      signals: [{ factor: "timeline", text: "realistically after Q1" }],
      mapping: "Mapped.",
    });
    expect(reasoning).toContain("call-99");
    expect(reasoning).toContain("realistically after Q1");
    expect(reasoning).toContain("nothing was averaged");
  });
});

describe("payloadWithoutAudio", () => {
  it("drops audio-bearing keys and keeps the rest", () => {
    const stripped = payloadWithoutAudio({
      id: "rec_1",
      transcript: "Maya: after Q1",
      download_url: "https://example.com/a.mp4",
      recording_files: [{ play_url: "https://example.com/a.mp4", text: "x" }],
    });
    expect(stripped).toEqual({
      id: "rec_1",
      transcript: "Maya: after Q1",
    });
  });
});

describe("transcript logs", () => {
  it("drops transcript fields from the serialized line", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    transcriptLog("transcript.webhook.received", {
      transcript: "Maya said after Q1",
      eventId: "abc",
    });
    const line = String(spy.mock.calls[0]?.[0] ?? "");
    expect(line).not.toContain("Maya said");
    expect(logHasForbiddenContent(line)).toBe(false);
    spy.mockRestore();
  });
});
