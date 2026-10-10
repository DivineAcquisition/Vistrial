import {
  QUESTION_IDS,
  ROLEPLAY_CHECKS,
  type QuestionId,
} from "@/lib/talent/questions";
import type { Precheck, RoleplayChecks, ScoreInput } from "@/lib/talent/score";

export type DraftAnswers = Record<QuestionId, { answer: string; probe: string; quote: string; score: number | null }>;

export type InterviewDraft = {
  precheck: Precheck;
  answers: DraftAnswers;
  roleplay: RoleplayChecks;
  dishonesty: boolean;
};

function text(form: FormData, key: string, max: number): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

function yesNo(form: FormData, key: string): boolean {
  return form.get(key) === "yes";
}

export function parseInterviewForm(form: FormData): InterviewDraft {
  const answers = {} as DraftAnswers;
  for (const id of QUESTION_IDS) {
    const raw = text(form, `${id}_score`, 2);
    const score = raw === "" ? null : Number(raw);
    answers[id] = {
      answer: text(form, `${id}_answer`, 4000),
      probe: text(form, `${id}_probe`, 2000),
      quote: text(form, `${id}_quote`, 500),
      score: Number.isInteger(score) ? score : null,
    };
  }
  const roleplay = {} as RoleplayChecks;
  for (const check of ROLEPLAY_CHECKS) {
    roleplay[check.key] = form.get(`roleplay_${check.key}`) === "yes";
  }
  return {
    precheck: {
      availability: text(form, "availability", 500),
      timezone: text(form, "timezone", 80),
      quietSpace: yesNo(form, "quiet_space"),
      reliableInternet: yesNo(form, "internet"),
      headset: yesNo(form, "headset"),
      computer: yesNo(form, "computer"),
      crm: text(form, "crm", 200),
      canStartSoon: yesNo(form, "start_soon"),
    },
    answers,
    roleplay,
    dishonesty: form.get("dishonesty") === "yes",
  };
}

export function toScoreInput(draft: InterviewDraft): { ok: true; input: ScoreInput } | { ok: false; error: string } {
  const scores = {} as Record<QuestionId, number>;
  const quotes = {} as Record<QuestionId, string>;
  for (const id of QUESTION_IDS) {
    const row = draft.answers[id];
    if (!row.answer) return { ok: false, error: "Write what the candidate said for every question." };
    if (!row.quote) return { ok: false, error: "Each score needs a short quote from the candidate." };
    if (row.score == null) return { ok: false, error: "Score every question from 1 to 5." };
    scores[id] = row.score;
    quotes[id] = row.quote;
  }
  return {
    ok: true,
    input: {
      scores,
      quotes,
      roleplay: draft.roleplay,
      precheck: draft.precheck,
      dishonesty: draft.dishonesty,
    },
  };
}
