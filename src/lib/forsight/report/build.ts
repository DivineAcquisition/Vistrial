import type {
  ForsightReport,
  FunnelStep,
  MonthlyMetrics,
  ReportComparison,
  ReportFigure,
  ReportOmission,
  ReportPeriod,
  ReportSection,
} from "@/lib/forsight/report/types";

/**
 * Turns a month's metrics into the document a client reads.
 *
 * Two rules shape everything here. A line the workspace's source cannot
 * produce is left out entirely rather than shown as zero or as "unavailable" —
 * this is a client-facing document and our plumbing gaps are not the client's
 * business — but the omission is recorded so an operator can see it. And a
 * section with nothing in it becomes one plain sentence, because an empty
 * heading reads as broken software.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthPeriod(start: string): ReportPeriod {
  const [year, month] = start.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end, label: `${MONTHS[month - 1]} ${year}` };
}

/** First of the month before the one containing `today`. */
export function previousMonthStart(today: string): string {
  const [year, month] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return date.toISOString().slice(0, 10);
}

function percent(part: number, whole: number): string | undefined {
  if (whole <= 0) return undefined;
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function round1(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** Adds a figure, or records why it is not there. */
function figures(
  entries: Array<{ label: string; value: string | null; note?: string; reason: string }>,
  section: string,
  omissions: ReportOmission[]
): ReportFigure[] {
  const out: ReportFigure[] = [];
  for (const entry of entries) {
    if (entry.value === null) {
      omissions.push({ section, line: entry.label, reason: entry.reason });
      continue;
    }
    out.push({ label: entry.label, value: entry.value, note: entry.note });
  }
  return out;
}

function funnelSection(metrics: MonthlyMetrics): ReportSection {
  const order: Array<[string, number]> = [
    ["Opted in", metrics.funnel.optedIn],
    ["Scored", metrics.funnel.scored],
    ["Qualified", metrics.funnel.qualified],
    ["Contacted", metrics.funnel.contacted],
    ["Booked", metrics.funnel.booked],
    ["Held", metrics.funnel.held],
    ["Closed", metrics.funnel.closed],
  ];

  const steps: FunnelStep[] = order.map(([label, count], index) => ({
    label,
    count,
    fromPrevious: index === 0 ? undefined : percent(count, order[index - 1][1]),
  }));

  return { kind: "funnel", title: "The funnel", steps };
}

function speedSection(metrics: MonthlyMetrics, omissions: ReportOmission[]): ReportSection {
  const section = "Speed and touch";
  const rows = figures(
    [
      {
        label: "Median hours to first human touch",
        value:
          metrics.speed.medianHoursToFirstHumanTouch === null
            ? null
            : round1(metrics.speed.medianHoursToFirstHumanTouch),
        reason: "No lead was contacted by a person this month.",
      },
      {
        label: "Ready leads contacted within four hours",
        value:
          metrics.speed.readyContactedWithinFourHoursPercent === null
            ? null
            : `${Math.round(metrics.speed.readyContactedWithinFourHoursPercent)}%`,
        reason: "No lead cleared qualification this month.",
      },
      {
        label: "Show rate",
        value:
          metrics.speed.showRatePercent === null
            ? null
            : `${Math.round(metrics.speed.showRatePercent)}%`,
        reason: "No call was booked this month.",
      },
      {
        label: "Rebook rate",
        value:
          metrics.speed.rebookRatePercent === null
            ? null
            : `${Math.round(metrics.speed.rebookRatePercent)}%`,
        reason: "Nobody no-showed this month, so there was nothing to rebook.",
      },
    ],
    section,
    omissions
  );

  // The centrepiece. When an owner sees closed deals averaged six human
  // touches and lost deals averaged one, the value of the system stops being
  // abstract — so it is a comparison, not two numbers in a list.
  const closed = metrics.speed.averageTouchesOnClosed;
  const lost = metrics.speed.averageTouchesOnLost;
  let comparison: ReportComparison | null = null;

  if (closed === null || lost === null) {
    omissions.push({
      section,
      line: "Human touches on closed versus lost",
      reason:
        closed === null && lost === null
          ? "Nothing closed and nothing was lost this month."
          : closed === null
            ? "Nothing closed this month."
            : "Nothing was lost this month.",
    });
  } else {
    comparison = {
      title: "Human touches before the outcome",
      left: { label: "Deals that closed", value: closed, display: round1(closed) },
      right: { label: "Deals that were lost", value: lost, display: round1(lost) },
      interpretation: comparisonSentence(closed, lost),
    };
  }

  return { kind: "speed", title: section, figures: rows, comparison };
}

export function comparisonSentence(closed: number, lost: number): string {
  if (closed <= 0 && lost <= 0) return "Neither group was contacted by a person this month.";
  if (lost <= 0) {
    return `Deals that closed averaged ${round1(closed)} human touches. Nothing that was lost got any.`;
  }
  const ratio = closed / lost;
  if (ratio >= 1.5) {
    return `Deals that closed got ${round1(ratio)}× the human contact of deals that were lost. That gap is the system working.`;
  }
  if (ratio <= 0.75) {
    return "Deals that were lost got more human contact than deals that closed. That is worth a conversation — effort is going into the wrong conversations.";
  }
  return "Closed and lost deals got roughly the same human contact this month, so contact volume alone did not decide the outcome.";
}

function revenueSection(metrics: MonthlyMetrics, omissions: ReportOmission[]): ReportSection {
  const section = "Revenue";
  const rows = figures(
    [
      {
        label: "New",
        value: metrics.revenue.newCents === null ? null : money(metrics.revenue.newCents),
        reason: "This workspace's source does not record which closes were first-time.",
      },
      {
        label: "Repeat",
        value: metrics.revenue.repeatCents === null ? null : money(metrics.revenue.repeatCents),
        reason: "This workspace's source does not record prior purchases per client.",
      },
      {
        label: "Recurring",
        value:
          metrics.revenue.recurringCents === null ? null : money(metrics.revenue.recurringCents),
        reason: "Recurring revenue is not distinguished from one-off revenue in this workspace's source.",
      },
      {
        // Kept apart from New on purpose: it is the number that justifies the
        // ongoing engagement, and folded in it would disappear.
        label: "Reactivated",
        value:
          metrics.revenue.reactivatedCents === null
            ? null
            : money(metrics.revenue.reactivatedCents),
        reason: "Reactivation is not distinguished from a first close in this workspace's source.",
      },
    ],
    section,
    omissions
  );

  return { kind: "revenue", title: section, figures: rows };
}

function nurtureSection(metrics: MonthlyMetrics, omissions: ReportOmission[]): ReportSection {
  const section = "Nurture health";
  const rows = figures(
    [
      {
        label: "Leads in the nurture pool",
        value: metrics.nurture.poolSize === null ? null : String(metrics.nurture.poolSize),
        reason: "This workspace's source does not separate a nurture track.",
      },
      {
        label: "Re-score responses received",
        value:
          metrics.nurture.rescoreResponses === null
            ? null
            : String(metrics.nurture.rescoreResponses),
        reason: "Re-scoring is not recorded in this workspace's source.",
      },
      {
        label: "Moved from nurture to ready",
        value: metrics.nurture.movedToReady === null ? null : String(metrics.nurture.movedToReady),
        reason: "Track changes are not recorded in this workspace's source.",
      },
      {
        label: "Revenue from leads that moved",
        value:
          metrics.nurture.revenueFromMovedCents === null
            ? null
            : money(metrics.nurture.revenueFromMovedCents),
        reason: "Revenue cannot be attributed to a track change in this workspace's source.",
      },
    ],
    section,
    omissions
  );

  return { kind: "nurture", title: section, figures: rows };
}

function teamSection(metrics: MonthlyMetrics, omissions: ReportOmission[]): ReportSection {
  const section = "Team scorecard";
  if (!metrics.team) {
    omissions.push({
      section,
      line: "Whole section",
      reason: "This workspace's source does not record who a lead was assigned to.",
    });
    return {
      kind: "absent",
      title: section,
      line: "This workspace does not track leads by owner, so there is no per-person breakdown this month.",
    };
  }

  if (metrics.team.length === 0) {
    return {
      kind: "absent",
      title: section,
      line: "No leads were assigned to anyone this month.",
    };
  }

  return {
    kind: "team",
    title: section,
    table: {
      columns: [
        "Person",
        "Assigned",
        "Within 4 hrs",
        "Never contacted",
        "Avg touches",
        "Booked",
        "Show rate",
      ],
      rows: metrics.team.map((member) => [
        member.name,
        String(member.assigned),
        String(member.contactedWithinFourHours),
        String(member.neverContacted),
        round1(member.averageTouches),
        String(member.booked),
        member.showRatePercent === null ? "—" : `${Math.round(member.showRatePercent)}%`,
      ]),
    },
  };
}

/**
 * What the shape of the month's objections means. Generated from the actual
 * distribution rather than shown as a static legend, because this section is
 * what makes the report a diagnosis rather than a receipt.
 */
export function objectionInterpretation(
  entries: Array<{ objection: string; count: number }>
): string {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return "";

  const top = [...entries].sort((a, b) => b.count - a.count)[0];
  const share = top.count / total;
  const key = top.objection.trim().toLowerCase();
  const lead = `${top.objection} led the month at ${Math.round(share * 100)}% of held calls.`;

  const reading =
    key.includes("price") || key.includes("cost") || key.includes("money")
      ? "Mostly price points at an offer or a qualification problem: either the offer is not landing as worth it, or the wrong people are reaching the call."
      : key.includes("spouse") || key.includes("partner")
        ? "Mostly spouse means intake is not capturing decision authority. The fix is upstream of the call, in the questions asked at application."
        : key.includes("trust") || key.includes("proof")
          ? "Mostly trust means a proof gap upstream. They arrive at the call unconvinced the result is real."
          : key.includes("think")
            ? "Mostly thinking means the call itself is not closing. The prospect is qualified and unconvinced when they hang up."
            : key.includes("fit")
              ? "Mostly fit means a targeting problem before the call. These people should not have reached a calendar."
              : key.includes("timing")
                ? "Mostly timing means they reached the call before they were ready to buy. That is usually qualification, not a close problem on the call."
                : "No single objection dominates in a way that points at one cause.";

  const spread =
    share < 0.4 && entries.length > 2
      ? " The spread is wide, so treat this as a hint rather than a diagnosis."
      : "";

  return `${lead} ${reading}${spread}`;
}

function objectionSection(metrics: MonthlyMetrics): ReportSection {
  const section = "Objections";
  if (metrics.objections === null) {
    return {
      kind: "absent",
      title: section,
      line: "This workspace does not record the objections from held calls.",
    };
  }

  const entries = metrics.objections;
  if (entries.length === 0) {
    return {
      kind: "absent",
      title: section,
      line:
        metrics.funnel.held > 0
          ? "Calls were held this month, but none recorded an objection."
          : "No calls were held this month, so there are no objections to read.",
    };
  }

  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const sorted = [...entries].sort((a, b) => b.count - a.count);

  return {
    kind: "objections",
    title: section,
    table: {
      columns: ["Objection", "Calls", "Share"],
      rows: sorted.map((entry) => [
        entry.objection,
        String(entry.count),
        percent(entry.count, total) ?? "—",
      ]),
    },
    interpretation: objectionInterpretation(sorted),
  };
}

export function buildReport(args: {
  workspace: { id: string; name: string };
  period: ReportPeriod;
  generatedAt: string;
  metrics: MonthlyMetrics;
}): ForsightReport {
  const omissions: ReportOmission[] = [...args.metrics.omissions];

  const sections: ReportSection[] = [
    funnelSection(args.metrics),
    speedSection(args.metrics, omissions),
    revenueSection(args.metrics, omissions),
    nurtureSection(args.metrics, omissions),
    teamSection(args.metrics, omissions),
    objectionSection(args.metrics),
  ];

  // A section whose every line was omitted is an empty heading. Say it once.
  const resolved = sections.map((section) => {
    if (
      (section.kind === "revenue" || section.kind === "nurture") &&
      section.figures.length === 0
    ) {
      return {
        kind: "absent" as const,
        title: section.title,
        line: `Nothing to report under ${section.title.toLowerCase()} this month.`,
      };
    }
    if (section.kind === "speed" && section.figures.length === 0 && !section.comparison) {
      return {
        kind: "absent" as const,
        title: section.title,
        line: "No leads were contacted this month, so there is no speed or touch to report.",
      };
    }
    return section;
  });

  return {
    schemaVersion: 1,
    workspace: args.workspace,
    period: args.period,
    generatedAt: args.generatedAt,
    sections: resolved,
    omissions,
  };
}
