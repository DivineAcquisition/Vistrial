import { describe, expect, it } from "vitest";

import { normalizeTranscript } from "@/lib/transcripts/normalize";

describe("transcript normalizers", () => {
  it("turns each supported source into one internal shape", () => {
    const fathom = normalizeTranscript("fathom", {
      recording: {
        id: "rec_1",
        title: "Maya discovery",
        started_at: "2026-03-12T15:00:00.000Z",
        duration_in_seconds: 1800,
        calendar_invitees: [{ email: "maya.chen@example.com" }],
        transcript: "Maya: We are looking at after Q1.\nSetter: Got it.",
      },
    });
    const fireflies = normalizeTranscript("fireflies", {
      meetingId: "ff_1",
      title: "Maya",
      date: "2026-03-12T15:00:00.000Z",
      duration: 120,
      attendees: [{ email: "maya.chen@example.com" }],
      sentences: [
        { speaker_name: "Maya", text: "We are looking at after Q1." },
      ],
    });
    const zoom = normalizeTranscript("zoom", {
      object: {
        uuid: "zm_1",
        topic: "Maya",
        start_time: "2026-03-12T15:00:00.000Z",
        duration: 40,
        participants: [{ email: "maya.chen@example.com" }],
        transcript: "Maya: We are looking at after Q1.",
      },
    });
    const ghl = normalizeTranscript("ghl", {
      appointmentId: "appt_1",
      appointment: { id: "appt_1", startTime: "2026-03-12T15:00:00.000Z" },
      transcript: "Maya: We are looking at after Q1.",
      email: "maya.chen@example.com",
    });
    const manual = normalizeTranscript("manual", {
      callId: "call_1",
      transcript: "Maya: We are looking at after Q1.",
    });

    for (const result of [fathom, fireflies, zoom, ghl, manual]) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.transcript).toContain("after Q1");
      expect(result.value.source).toBeTruthy();
    }

    if (fathom.ok) expect(fathom.value.providerCallId).toBe("rec_1");
    if (ghl.ok) expect(ghl.value.providerCallId).toBe("appt_1");
  });

  it("rejects an empty transcript instead of inventing one", () => {
    expect(normalizeTranscript("manual", { transcript: "   " }).ok).toBe(false);
  });

  it("does not treat recording files as a transcript", () => {
    const zoom = normalizeTranscript("zoom", {
      object: {
        uuid: "zm_2",
        recording_files: [{ file_type: "MP4", download_url: "https://zoom.us/a.mp4" }],
      },
    });
    expect(zoom.ok).toBe(false);
  });
});
