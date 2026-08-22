import type { Enums } from "@/types/database";

/**
 * What the client said a setter nails down before booking, expressed as the
 * application answer keys and extraction signals that would carry it. The
 * pre-call brief reads this so a closer sees the list the setter was working
 * to, and sees plainly where the setter did not get there.
 */
export const SETTER_FACT_SOURCES: Record<
  Enums<"profile_setter_fact">,
  { label: string; keys: string[] }
> = {
  budget_confirmed: { label: "Budget", keys: ["budget", "budget_signal", "investment", "annual_revenue"] },
  timeline_confirmed: { label: "Timeline", keys: ["timeline", "timeline_signal"] },
  decision_maker_confirmed: {
    label: "Decision maker",
    keys: ["authority", "decision", "decision_process"],
  },
  pain_articulated: { label: "The problem, in their words", keys: ["pain", "problem", "challenge"] },
  current_solution: { label: "What they do today", keys: ["current_solution", "using_now", "tried"] },
  goal_stated: { label: "What they want instead", keys: ["goal", "outcome", "target"] },
  call_purpose_set: { label: "Why this call is happening", keys: ["call_purpose", "reason"] },
  other: { label: "Also agreed", keys: [] },
};

export function buildSetterFacts(
  configured: Enums<"profile_setter_fact">[],
  answers: Record<string, unknown>,
  formatAnswer: (value: unknown) => string,
  otherLabel: string | null
): Array<{ label: string; value: string }> {
  return configured.map((fact) => {
    const source = SETTER_FACT_SOURCES[fact];
    const label = fact === "other" && otherLabel ? otherLabel : source.label;
    const key = source.keys.find((candidate) =>
      Object.prototype.hasOwnProperty.call(answers, candidate)
    );
    return {
      label,
      value: key ? formatAnswer(answers[key]) : "Not established",
    };
  });
}
