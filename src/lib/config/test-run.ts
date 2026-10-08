import { isOpenAt, type AfterHoursMode, type BusinessHours } from "@/lib/config/clock";
import { describeMinutes } from "@/lib/config/format";
import { checkQuietHours, type QuietWindow } from "@/lib/compliance/rules";
import type { ConfigValues } from "@/lib/config/types";

/**
 * A dry run of one sample lead through a configuration: how it would be
 * qualified, when it must hear from a person, what a first text would look
 * like, and what the compliance rules would do. Nothing is sent or saved
 * except the result, which the go-live check records.
 */
export type TestRunStep = { title: string; lines: string[]; ok: boolean };

export type SampleLead = {
  firstName: string;
  arrivedAt: Date;
  /** 0–100 per scoring factor. */
  factors: Record<string, number>;
  knownFacts: string[];
};

export function defaultSampleLead(now: Date): SampleLead {
  return {
    firstName: "Jordan",
    arrivedAt: now,
    factors: { timeline: 80, investment_capacity: 60, decision_authority: 100, pain_severity: 50 },
    knownFacts: [],
  };
}

function formatAt(at: Date, timeZone: string): string {
  return at.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone });
}

/** When the first-touch window runs out for a lead arriving at `arrivedAt`. */
export function firstTouchDeadline(args: {
  arrivedAt: Date;
  mode: AfterHoursMode;
  windowMinutes: number;
  afterHoursWindowMinutes: number;
  hours: BusinessHours;
  timeZone: string;
}): Date {
  if (args.mode === "keep_running") return new Date(args.arrivedAt.getTime() + args.windowMinutes * 60_000);
  if (args.mode === "separate_window") {
    const window = isOpenAt(args.arrivedAt, args.hours, args.timeZone) ? args.windowMinutes : args.afterHoursWindowMinutes;
    return new Date(args.arrivedAt.getTime() + window * 60_000);
  }
  // Pause: count only open minutes, in one-minute steps, for at most two weeks.
  let open = 0;
  let at = args.arrivedAt.getTime();
  const limit = at + 14 * 86_400_000;
  while (at < limit) {
    if (isOpenAt(new Date(at), args.hours, args.timeZone)) {
      open += 1;
      if (open >= args.windowMinutes) return new Date(at + 60_000);
    }
    at += 60_000;
  }
  return new Date(limit);
}

export function runConfigTest(values: ConfigValues, lead: SampleLead): TestRunStep[] {
  const steps: TestRunStep[] = [];
  const timeZone = String(values["identity.timezone"] ?? "America/New_York");

  // Qualification
  const weights = (values["qualification.factor_weights"] ?? {}) as Record<string, number>;
  const score = Math.round(
    Object.entries(weights).reduce((sum, [factor, weight]) => sum + ((lead.factors[factor] ?? 0) * Number(weight)) / 100, 0)
  );
  const bands = ((values["qualification.scoring_bands"] ?? []) as Array<{ name: string; min_score: number; next_step: string }>)
    .slice()
    .sort((a, b) => a.min_score - b.min_score);
  const band = [...bands].reverse().find((entry) => score >= entry.min_score);
  const threshold = Number(values["qualification.ready_threshold"] ?? 0);
  const missingFacts = ((values["qualification.minimum_info"] ?? []) as string[]).filter((fact) => !lead.knownFacts.includes(fact));
  steps.push({
    title: "Qualification",
    ok: Boolean(band),
    lines: [
      `${lead.firstName} scores ${score} out of 100.`,
      band ? `That is "${band.name}": ${band.next_step}` : "No score band covers this score. Start the first band at 0.",
      score >= threshold && missingFacts.length === 0
        ? `Counts as ready to buy (ready from ${threshold}).`
        : missingFacts.length
          ? `Not counted as ready yet: still need ${missingFacts.join(", ")}.`
          : `Not ready yet (ready from ${threshold}).`,
    ],
  });

  // Response window
  const windowMinutes = Number(values["response.first_touch_minutes"] ?? 0);
  const mode = (values["response.after_hours"] ?? "keep_running") as AfterHoursMode;
  const hours = (values["identity.business_hours"] ?? { days: {} }) as BusinessHours;
  const deadline = windowMinutes
    ? firstTouchDeadline({
        arrivedAt: lead.arrivedAt,
        mode,
        windowMinutes,
        afterHoursWindowMinutes: Number(values["response.after_hours_window_minutes"] ?? windowMinutes),
        hours,
        timeZone,
      })
    : null;
  steps.push({
    title: "Response window",
    ok: deadline !== null,
    lines: deadline
      ? [
          `Arrives ${formatAt(lead.arrivedAt, timeZone)} (${timeZone}); ${isOpenAt(lead.arrivedAt, hours, timeZone) ? "the business is open" : "the business is closed"}.`,
          `Must hear from a person within ${describeMinutes(windowMinutes)}${mode === "pause" ? " of open hours" : ""}: by ${formatAt(deadline, timeZone)}.`,
        ]
      : ["No first-touch window is set."],
  });

  // Sample first text
  const smsMax = Number(values["tone.sms_max_chars"] ?? 300);
  const disclosures = (values["compliance.required_disclosures"] ?? []) as string[];
  const signOff = String(values["tone.sign_off"] ?? "").trim();
  const sender = String(values["tone.sender_identity"] ?? "").trim();
  const business = String(values["identity.display_name"] ?? values["identity.business_name"] ?? "").trim();
  const body = [
    `${lead.firstName}, thanks for reaching out${business ? ` to ${business}` : ""}.`,
    "When is a good time for a quick call?",
    ...disclosures,
  ].join(" ");
  const banned = ((values["tone.banned_terms"] ?? []) as string[]).filter((term) => body.toLowerCase().includes(term.toLowerCase()));
  steps.push({
    title: "Sample first text (not sent)",
    ok: body.length <= smsMax && banned.length === 0,
    lines: [
      `"${body}"`,
      `${body.length} of ${smsMax} characters.${sender ? ` Sent as ${sender}.` : ""}${signOff ? " Texts carry no sign-off; emails end with it." : ""}`,
      ...(banned.length ? [`Uses words this workspace avoids: ${banned.join(", ")}.`] : []),
    ],
  });

  // Compliance
  const quiet = values["compliance.quiet_hours"] as QuietWindow | undefined;
  const check = quiet ? checkQuietHours(lead.arrivedAt, quiet, [timeZone]) : { quiet: false as const };
  const words = (values["compliance.opt_out_words"] ?? []) as string[];
  steps.push({
    title: "Compliance",
    ok: Boolean(quiet),
    lines: [
      quiet
        ? `No messages between ${quiet.start} and ${quiet.end}, in ${values["compliance.quiet_hours_basis"] === "lead_local" ? "the lead's own time zone" : "the business's time zone"}.`
        : "Quiet hours are not set.",
      check.quiet ? `A message now would wait until ${formatAt(check.resumeAt, timeZone)}.` : "A message now could go out straight away.",
      `At most ${values["compliance.daily_cap_per_lead"]} messages a day to one lead, counting ${values["compliance.cap_applies_to"] === "every_send" ? "every message" : "only messages sent without approval"}.`,
      words.length ? `A reply of ${words.join(", ")} stops all messages to that person.` : "No opt-out words are set.",
    ],
  });

  return steps;
}
