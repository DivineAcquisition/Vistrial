import { describe, expect, it } from "vitest";

import { matchTranscriptToCall, type MatchableCall, type MatchableLead } from "@/lib/transcripts/match";
import type { NormalizedTranscript } from "@/lib/transcripts/types";

const lead: MatchableLead = { id: "lead-1", email: "maya.chen@example.com" };
const call = (over: Partial<MatchableCall>): MatchableCall => ({
  id: "call-1",
  leadId: "lead-1",
  scheduledAt: "2026-03-12T15:00:00.000Z",
  occurredAt: null,
  transcriptProviderId: null,
  ghlAppointmentId: null,
  hasTranscript: false,
  ...over,
});

function transcript(over: Partial<NormalizedTranscript>): NormalizedTranscript {
  return {
    source: "fathom",
    providerEventId: "evt",
    providerCallId: null,
    occurredAt: "2026-03-12T15:05:00.000Z",
    scheduledAt: null,
    durationSeconds: 60,
    participantEmails: ["maya.chen@example.com"],
    title: "Maya",
    transcript: "hello",
    ...over,
  };
}

describe("transcript matching", () => {
  it("attaches on an explicit recorder call id", () => {
    const result = matchTranscriptToCall({
      transcript: transcript({ providerCallId: "rec_1" }),
      calls: [call({ transcriptProviderId: "rec_1" })],
      leads: [lead],
    });
    expect(result).toEqual({ kind: "matched", callId: "call-1", method: "provider_id" });
  });

  it("attaches on time when that window is unique", () => {
    const result = matchTranscriptToCall({
      transcript: transcript({ providerCallId: null, participantEmails: [] }),
      calls: [call({})],
      leads: [lead],
    });
    expect(result).toEqual({ kind: "matched", callId: "call-1", method: "time" });
  });

  it("attaches on participant email when the lead has one eligible call", () => {
    const result = matchTranscriptToCall({
      transcript: transcript({
        providerCallId: null,
        occurredAt: "2026-08-01T12:00:00.000Z",
        scheduledAt: null,
      }),
      calls: [call({ scheduledAt: "2026-03-12T15:00:00.000Z" })],
      leads: [lead],
    });
    expect(result).toEqual({ kind: "matched", callId: "call-1", method: "email" });
  });

  it("never guesses when two calls sit in the same window", () => {
    const result = matchTranscriptToCall({
      transcript: transcript({ providerCallId: null, participantEmails: [] }),
      calls: [
        call({ id: "call-1" }),
        call({ id: "call-2", scheduledAt: "2026-03-12T15:10:00.000Z" }),
      ],
      leads: [lead],
    });
    expect(result).toEqual({ kind: "unmatched", reason: "no_unique_call" });
  });

  it("never guesses when two leads share an email match", () => {
    const result = matchTranscriptToCall({
      transcript: transcript({
        providerCallId: null,
        occurredAt: null,
        scheduledAt: null,
      }),
      calls: [call({}), call({ id: "call-2", leadId: "lead-2" })],
      leads: [lead, { id: "lead-2", email: "maya.chen@example.com" }],
    });
    expect(result.kind).toBe("unmatched");
  });
});
