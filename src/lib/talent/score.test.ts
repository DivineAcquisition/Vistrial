import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { interviewReportPdf } from "@/lib/talent/report";
import { parseInterviewForm, toScoreInput } from "@/lib/talent/parse";
import { combineInterviews, scoreInterview, type Precheck, type RoleplayChecks, type ScoreInput } from "@/lib/talent/score";
import type { QuestionId } from "@/lib/talent/questions";

const ready: Precheck = {
  availability: "Weekdays 9 to 5",
  timezone: "America/New_York",
  quietSpace: true,
  reliableInternet: true,
  headset: true,
  computer: true,
  crm: "GoHighLevel",
  canStartSoon: true,
};

const roleplay: RoleplayChecks = {
  acknowledged: true,
  noInventedPrice: true,
  asked: true,
  twoTimes: true,
  brief: false,
};

function input(scores: Record<QuestionId, number>, extra?: Partial<ScoreInput>): ScoreInput {
  const quotes = Object.fromEntries(Object.keys(scores).map((id) => [id, `Quote for ${id}`])) as Record<QuestionId, string>;
  return {
    scores,
    quotes,
    roleplay,
    precheck: ready,
    dishonesty: false,
    ...extra,
  };
}

const exampleScores: Record<QuestionId, number> = {
  q1: 4, q2: 3, q3: 5, q4: 4, q5: 3, q6: 4, q7: 5, q8: 4, q9: 4, q10: 3,
};

function all(score: number, overrides: Partial<Record<QuestionId, number>> = {}): Record<QuestionId, number> {
  return { q1: score, q2: score, q3: score, q4: score, q5: score, q6: score, q7: score, q8: score, q9: score, q10: score, ...overrides };
}

function readablePdf(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const inflated = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    try {
      return inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      return match[1];
    }
  });
  const streams = inflated.join("\n");
  const decodedHex = [...`${raw}\n${streams}`.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => Buffer.from(match[1], "hex").toString("latin1"))
    .join("\n");
  return `${raw}\n${streams}\n${decodedHex}`;
}

describe("sales operator score", () => {
  it("matches the published example: 56 of 70 is a final score of 80", () => {
    const result = scoreInterview(input(exampleScores));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.weighted).toBe(56);
    expect(result.card.finalScore).toBe(80);
    expect(result.card.band).toBe("possible");
    expect(result.card.decision).toBe("second");
    expect(result.card.gates).toEqual({ q7: true, q8: true });
    expect(result.card.traits.execution).toBe(4.5);
    expect(result.card.traits.integrity).toBe(4.5);
  });

  it("refuses a hire when logging scores 2, even with a high total", () => {
    const result = scoreInterview(input(all(5, { q8: 2 })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.finalScore).toBeGreaterThanOrEqual(84);
    expect(result.card.decision).toBe("decline");
    expect(result.card.gates.q8).toBe(false);
  });

  it("drops a strong score one band when speed is a 2", () => {
    const result = scoreInterview(input(all(5, { q3: 2 })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.band).toBe("strong");
    expect(result.card.bandAfterDowngrade).toBe("possible");
    expect(result.card.decision).toBe("second");
  });

  it("drops a possible score to do not advance when speed is a 2", () => {
    const result = scoreInterview(input(all(4, { q3: 2 })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.band).toBe("possible");
    expect(result.card.decision).toBe("decline");
  });

  it("holds for the hiring manager when any other question is a 1", () => {
    const result = scoreInterview(input(all(5, { q1: 1 })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.decision).toBe("hold");
  });

  it("holds when the pre-interview check has no reliable internet", () => {
    const result = scoreInterview(input(all(5), { precheck: { ...ready, reliableInternet: false } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.decision).toBe("hold");
    expect(result.card.holdFlags).toContain("No reliable internet.");
  });

  it("rejects a high roleplay score that misses the checks, and rejects half points", () => {
    const weakRoleplay = scoreInterview(input(all(5), { roleplay: { ...roleplay, acknowledged: false, asked: false, twoTimes: false } }));
    expect(weakRoleplay.ok).toBe(false);
    const half = scoreInterview(input(all(5, { q1: 3.5 })));
    expect(half.ok).toBe(false);
  });

  it("treats a gate failure by any interviewer as a no-hire, and flags a 2-point split", () => {
    const combined = combineInterviews([
      input(all(5)),
      input(all(5, { q6: 3, q8: 2 })),
    ]);
    expect("error" in combined).toBe(false);
    if ("error" in combined) return;
    expect(combined.gateFromAnyInterviewer).toBe(true);
    expect(combined.card.decision).toBe("decline");
    expect(combined.disagreements).toContain("q6");
  });
});

describe("interview report", () => {
  it("prints the decision and the candidate's quote", async () => {
    const result = scoreInterview(input(exampleScores));
    if (!result.ok) throw new Error(result.error);
    const bytes = await interviewReportPdf({
      applicantName: "Example Candidate",
      email: "example@example.com",
      interviewer: "Malik",
      submittedAt: "2026-10-10T17:00:00.000Z",
      precheck: ready,
      answers: { q1: { answer: "I want to learn the work.", probe: "" } },
      card: result.card,
    });
    const text = readablePdf(bytes);
    expect(Buffer.from(bytes).toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(text).toContain("Example Candidate");
    expect(text).toContain("Second conversation");
    expect(text).toContain("Quote for q1");
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe("interview form", () => {
  it("requires a quote before it will score", () => {
    const form = new FormData();
    form.set("availability", "Weekdays");
    form.set("timezone", "America/New_York");
    form.set("quiet_space", "yes");
    form.set("internet", "yes");
    form.set("headset", "yes");
    form.set("computer", "yes");
    form.set("start_soon", "yes");
    for (const id of ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"]) {
      form.set(`${id}_answer`, "A specific answer.");
      form.set(`${id}_score`, "4");
    }
    form.set("roleplay_acknowledged", "yes");
    form.set("roleplay_noInventedPrice", "yes");
    form.set("roleplay_asked", "yes");
    form.set("roleplay_twoTimes", "yes");
    const draft = parseInterviewForm(form);
    expect(toScoreInput(draft).ok).toBe(false);
    form.set("q1_quote", "I would call first.");
    for (const id of ["q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"]) form.set(`${id}_quote`, "Quote.");
    const readyInput = toScoreInput(parseInterviewForm(form));
    expect(readyInput.ok).toBe(true);
  });
});
