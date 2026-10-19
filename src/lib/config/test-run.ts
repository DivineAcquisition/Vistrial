import { computeAssayScore, type AssayInput } from "@/lib/assay/compute";
import { parseRules } from "@/lib/assay/rules";
import { stickyTier } from "@/lib/assay/tiers";
import { TIER_LABEL } from "@/lib/assay/vocabulary";
import { isOpenAt, type AfterHoursMode, type BusinessHours } from "@/lib/config/clock";
import { describeMinutes } from "@/lib/config/format";
import { checkQuietHours, type QuietWindow } from "@/lib/compliance/rules";
import type { ConfigValues } from "@/lib/config/types";

/**
 * A dry run of one sample lead through a configuration: how Assay would
 * score it, when it must hear from a person, what a first text would look
 * like, and what the compliance rules would do. Nothing is sent or saved
 * except the result, which the go-live check records.
 */
export type TestRunStep = { title: string; lines: string[]; ok: boolean };

export type SampleLead = {
  firstName: string;
  arrivedAt: Date;
  /** What Assay would see: approved inputs and activity metadata only. */
  assay: AssayInput;
  knownFacts: string[];
};

export function defaultSampleLead(now: Date): SampleLead {
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
  return {
    firstName: "Jordan",
    arrivedAt: now,
    assay: {
      leadId: "sample",
      fields: { contact_complete: true, service_offered: true, in_service_area: true },
      activities: [
        { id: "sample-reply", event: "replied", at: hoursAgo(20) },
        { id: "sample-booking", event: "booked", at: hoursAgo(19) },
      ],
      teamTouches: [{ id: "sample-text", at: hoursAgo(20.1) }],
      calls: { held: 0, pending: false },
      signals: [],
      source: null,
    },
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

  // Qualification, as Assay would score the sample lead.
  const { rules, problems } = parseRules(values);
  const scored = computeAssayScore(lead.assay, rules, lead.arrivedAt.toISOString());
  const tier = stickyTier(scored.score, rules.tiers, null, rules.stickiness);
  const missingFacts = ((values["qualification.minimum_info"] ?? []) as string[]).filter((fact) => !lead.knownFacts.includes(fact));
  steps.push({
    title: "Qualification",
    ok: problems.length === 0,
    lines: [
      `Assay scores ${lead.firstName} ${scored.score} out of 100: ${TIER_LABEL[tier]}${scored.early ? " (early score)" : ""}.`,
      ...scored.raising.map((hit) => `Raises it: ${hit.text}`),
      ...scored.notes,
      ...problems.map((problem) => problem.message),
      ...(missingFacts.length ? [`Not counted as ready yet: still need ${missingFacts.join(", ")}.`] : []),
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
