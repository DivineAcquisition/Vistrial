/**
 * The monthly client report.
 *
 * Six sections, fixed. This structure is what the Stellar install already
 * delivers and each section earns its place, so nothing is added and nothing
 * is dropped.
 *
 * Everything here is plain data. A generated report is serialised into
 * `forsight_reports.payload` and read back unchanged — viewing never
 * re-queries a source — so these shapes are a storage format as much as a
 * view model, and changing one is a migration rather than a refactor.
 */

export type ReportPeriod = {
  /** First of the calendar month. */
  start: string;
  /** Last day of it. */
  end: string;
  /** "August 2026". */
  label: string;
};

/** A single figure on the page. Omitted lines never reach here. */
export type ReportFigure = {
  label: string;
  value: string;
  /** Shown under the value where a number needs saying in words. */
  note?: string;
};

export type ReportTable = {
  columns: string[];
  rows: string[][];
};

/** Two bars, side by side, where the gap between them is the message. */
export type ReportComparison = {
  title: string;
  left: { label: string; value: number; display: string };
  right: { label: string; value: number; display: string };
  interpretation: string;
};

export type FunnelStep = {
  label: string;
  count: number;
  /** Conversion from the step above. Absent on the first step. */
  fromPrevious?: string;
};

export type ReportSection =
  | { kind: "funnel"; title: string; steps: FunnelStep[] }
  | {
      kind: "speed";
      title: string;
      figures: ReportFigure[];
      comparison: ReportComparison | null;
    }
  | { kind: "revenue"; title: string; figures: ReportFigure[] }
  | { kind: "nurture"; title: string; figures: ReportFigure[] }
  | { kind: "team"; title: string; table: ReportTable }
  | {
      kind: "objections";
      title: string;
      table: ReportTable;
      interpretation: string;
    }
  /** A section with nothing in it says so in one line rather than showing an empty heading. */
  | { kind: "absent"; title: string; line: string };

export type ReportOmission = {
  section: string;
  line: string;
  reason: string;
};

export type ForsightReport = {
  /** Bumped when these shapes change in a way stored reports cannot survive. */
  schemaVersion: 1;
  workspace: { id: string; name: string };
  period: ReportPeriod;
  generatedAt: string;
  sections: ReportSection[];
  omissions: ReportOmission[];
};

export type StoredReport = {
  id: string;
  orgId: string;
  version: number;
  generatedAt: string;
  generatedBy: "scheduled" | "operator";
  generatedByName: string | null;
  sourceType: string;
  report: ForsightReport;
  omissions: ReportOmission[];
};

/** The numbers a source adapter hands the generator. */
export type MonthlyMetrics = {
  funnel: {
    optedIn: number;
    scored: number;
    qualified: number;
    contacted: number;
    booked: number;
    held: number;
    closed: number;
  };
  speed: {
    medianHoursToFirstHumanTouch: number | null;
    readyContactedWithinFourHoursPercent: number | null;
    averageTouchesOnClosed: number | null;
    averageTouchesOnLost: number | null;
    showRatePercent: number | null;
    rebookRatePercent: number | null;
  };
  revenue: {
    newCents: number | null;
    repeatCents: number | null;
    recurringCents: number | null;
    reactivatedCents: number | null;
  };
  nurture: {
    poolSize: number | null;
    rescoreResponses: number | null;
    movedToReady: number | null;
    revenueFromMovedCents: number | null;
  };
  team: Array<{
    name: string;
    assigned: number;
    contactedWithinFourHours: number;
    neverContacted: number;
    averageTouches: number;
    booked: number;
    showRatePercent: number | null;
  }> | null;
  objections: Array<{ objection: string; count: number }> | null;
  /** Lines this source cannot produce, with the reason an operator needs. */
  omissions: ReportOmission[];
};
