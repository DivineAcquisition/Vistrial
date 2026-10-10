import { documentPdf } from "@/lib/reporting/pdf";
import { QUESTION_BY_ID, QUESTION_IDS, ROLE_LABEL, TRAIT_LABEL } from "@/lib/talent/questions";
import { DECISION_LABEL, type Precheck, type Scorecard } from "@/lib/talent/score";

export type InterviewAnswers = Record<string, { answer: string; probe: string }>;

function pdfSafe(text: string): string {
  return text
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "");
}

function precheckLines(precheck: Precheck): string[] {
  return [
    `Availability: ${precheck.availability || "Not given"} (${precheck.timezone || "time zone not given"})`,
    `Quiet space: ${precheck.quietSpace ? "Yes" : "No"}. Reliable internet: ${precheck.reliableInternet ? "Yes" : "No"}.`,
    `Headset: ${precheck.headset ? "Yes" : "No"}. Computer: ${precheck.computer ? "Yes" : "No"}.`,
    `CRM or calling tool: ${precheck.crm || "None named"}.`,
    `Can start training within two weeks: ${precheck.canStartSoon ? "Yes" : "No"}.`,
  ];
}

export function interviewReportPdf(args: {
  applicantName: string;
  email: string;
  interviewer: string;
  submittedAt: string;
  precheck: Precheck;
  answers: InterviewAnswers;
  card: Scorecard;
}): Promise<Uint8Array> {
  const card = args.card;
  const questionLines = QUESTION_IDS.map((id) => {
    const question = QUESTION_BY_ID[id];
    const result = card.questions[id];
    const said = args.answers[id];
    const quote = result.quote || "No quote recorded.";
    return `Q${question.number} ${question.title}: ${result.score} x ${result.weight} = ${result.points}. "${quote}" ${said?.answer ? `Answer: ${said.answer}` : ""}`.trim();
  });

  return documentPdf({
    title: "Interview report",
    subtitle: `${pdfSafe(args.applicantName)} · ${ROLE_LABEL}`,
    stampParts: [
      "Divine Acquisition",
      pdfSafe(args.interviewer),
      args.submittedAt,
      args.email,
    ].map(pdfSafe),
    summaryTitle: DECISION_LABEL[card.decision],
    summary: pdfSafe(card.reason),
    sections: [
      { title: "Pre-interview check", lines: precheckLines(args.precheck).map(pdfSafe) },
      { title: "Question scores", lines: questionLines.map(pdfSafe) },
      {
        title: "Roleplay checks",
        lines: [`${card.roleplayPassed} of 5 checks on the live objection.`],
      },
      {
        title: "Gates",
        lines: [
          `Integrity gate: ${card.gates.q7 ? "Passed" : "Failed"}.`,
          `Logging gate: ${card.gates.q8 ? "Passed" : "Failed"}.`,
          `Marked dishonest: ${card.dishonesty ? "Yes" : "No"}.`,
          card.holdFlags.length > 0 ? `Flags: ${card.holdFlags.join(" ")}` : "No hold flags.",
        ].map(pdfSafe),
      },
      {
        title: "Trait profile",
        lines: (Object.keys(TRAIT_LABEL) as Array<keyof typeof TRAIT_LABEL>).map(
          (trait) => `${TRAIT_LABEL[trait]}: ${card.traits[trait]}`,
        ),
      },
      { title: "Strengths", lines: card.strengths.map(pdfSafe) },
      { title: "Concerns", lines: card.concerns.map(pdfSafe) },
      {
        title: "If hired",
        lines: [
          card.academy.length > 0 ? `Academy focus: ${card.academy.join("; ")}.` : "No trait pair is under 3. Keep the standard Academy path.",
          card.placement,
          `Weighted total ${card.weighted} of 70. Final score ${card.finalScore} of 100.`,
          "A human makes the hiring decision. This score is a recommendation.",
        ].map(pdfSafe),
      },
    ],
  });
}
