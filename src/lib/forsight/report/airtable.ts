import "server-only";

import { listAirtableRecords } from "@/lib/forsight/airtable";
import { ForsightSourceError } from "@/lib/forsight/errors";
import {
  DEAL_FIELDS,
  DEBRIEF_FIELDS,
  LEAD_FIELDS,
  QUALIFIED,
  isClosedStage,
  readCount,
  readDate,
  readRaw,
  readText,
} from "@/lib/forsight/fields";
import {
  inPeriod,
  monthlyFromFacts,
  parseHours,
  revenueBucket,
  type MonthFacts,
  type MonthLead,
} from "@/lib/forsight/report/facts";
import type { MonthlyMetrics, ReportOmission } from "@/lib/forsight/report/types";
import type { ForsightAirtableSource, ForsightRecord, ForsightResult } from "@/lib/forsight/types";

/**
 * Tables the Stellar template has that the dashboard does not need. Read by
 * the conventional names the master base uses. A workspace whose base was
 * duplicated from that template has them; a workspace that does not simply
 * omits the lines those tables would have filled.
 */
export const REPORT_TABLES = {
  deals: "Deals",
  callDebriefs: "Call Debriefs",
} as const;

export async function airtableMonthly(
  source: ForsightAirtableSource,
  period: { start: string; end: string },
  orgLabel?: string | null,
  fetchImpl?: typeof fetch
): Promise<ForsightResult<MonthlyMetrics>> {
  const leadsTable = source.tables.leads?.trim();
  if (!leadsTable) {
    return {
      available: false,
      reason: "This workspace's base has no Leads table, so a monthly report cannot be built.",
    };
  }

  const read = (table: string, filterByFormula?: string) =>
    listAirtableRecords({
      orgId: source.orgId,
      orgLabel,
      baseId: source.baseId,
      table,
      filterByFormula,
      fetchImpl,
    });

  const leads = await read(
    leadsTable,
    `AND({${LEAD_FIELDS.optInDate}}>='${period.start}',{${LEAD_FIELDS.optInDate}}<='${period.end}')`
  );

  const omissions: ReportOmission[] = [];
  const deals = await optionalTable(read, REPORT_TABLES.deals, omissions, "Revenue");
  const debriefs = await optionalTable(read, REPORT_TABLES.callDebriefs, omissions, "Objections");

  const facts = airtableMonthFacts(leads, deals, debriefs, period, omissions);
  return { available: true, data: monthlyFromFacts(facts) };
}

async function optionalTable(
  read: (table: string, filter?: string) => Promise<ForsightRecord[]>,
  table: string,
  omissions: ReportOmission[],
  section: string
): Promise<ForsightRecord[] | null> {
  try {
    return await read(table);
  } catch (error) {
    if (error instanceof ForsightSourceError && error.httpStatus === 404) {
      omissions.push({
        section,
        line: table,
        reason: `This workspace's base has no ${table} table.`,
      });
      return null;
    }
    throw error;
  }
}

export function airtableMonthFacts(
  leads: ForsightRecord[],
  deals: ForsightRecord[] | null,
  debriefs: ForsightRecord[] | null,
  period: { start: string; end: string },
  omissions: ReportOmission[] = []
): MonthFacts {
  const monthLeads: MonthLead[] = leads
    .filter((record) => inPeriod(readDate(record, LEAD_FIELDS.optInDate), period.start, period.end))
    .map(leadFromRecord);

  return {
    leads: monthLeads,
    revenue: revenueFromDeals(deals, period),
    nurture: {
      poolSize: null,
      rescoreResponses: null,
      movedToReady: null,
      revenueFromMovedCents: null,
    },
    objections: objectionsFromDebriefs(debriefs, period),
    // The Leads table has no owner. Call Debriefs record who ran a call, which
    // is not assignment, so the scorecard is omitted rather than guessed.
    teamAvailable: false,
    omissions,
  };
}

function leadFromRecord(record: ForsightRecord): MonthLead {
  const stage = readText(record, LEAD_FIELDS.stage);
  const qualification = readText(record, LEAD_FIELDS.qualificationResult);
  const score = readCount(record, LEAD_FIELDS.readinessScore);
  const humanTouches = readCount(record, LEAD_FIELDS.humanTouches) ?? 0;
  const outcome = readText(record, LEAD_FIELDS.auditOutcome);
  const noShowCount = readCount(record, LEAD_FIELDS.noShowCount) ?? 0;
  const bookedFlag = readCount(record, LEAD_FIELDS.isBooked);
  const heldFlag = readCount(record, LEAD_FIELDS.isHeld);
  const booked =
    bookedFlag === 1 ||
    Boolean(readDate(record, LEAD_FIELDS.auditBookedDate)) ||
    /booked|held|proposal|closed won/i.test(stage);
  const held = heldFlag === 1 || /^held$/i.test(outcome);
  const noShow = noShowCount > 0 || /^no-?show$/i.test(outcome);
  const rescheduled = /^rescheduled$/i.test(outcome);

  return {
    id: record.id,
    hoursToFirstHuman: parseHours(readRaw(record, LEAD_FIELDS.hoursToFirstHuman)),
    humanTouches,
    scored: score !== null,
    qualified: qualification === QUALIFIED || (score !== null && score >= 60),
    contacted: humanTouches > 0,
    booked,
    held,
    closed: isClosedStage(stage) && /won/i.test(stage),
    lost: isClosedStage(stage) && /lost/i.test(stage),
    noShow,
    rebooked: noShow && (held || rescheduled || booked),
    assignedName: null,
  };
}

function revenueFromDeals(
  deals: ForsightRecord[] | null,
  period: { start: string; end: string }
): MonthlyMetrics["revenue"] {
  if (deals === null) {
    return { newCents: null, repeatCents: null, recurringCents: null, reactivatedCents: null };
  }

  // The template's Type field is Install Fee / Retainer / Audit Only.
  // Install Fee is New. Retainer is Recurring. Repeat and Reactivated are
  // not recorded, so they stay omitted — never folded into New, never zeroed.
  let newCents = 0;
  let recurringCents = 0;
  let repeatCents: number | null = null;
  let reactivatedCents: number | null = null;

  for (const deal of deals) {
    if (!inPeriod(readDate(deal, DEAL_FIELDS.date), period.start, period.end)) continue;
    const status = readText(deal, DEAL_FIELDS.status);
    if (status && !/^cleared$/i.test(status)) continue;
    const amount = readCount(deal, DEAL_FIELDS.amount);
    if (amount === null) continue;
    const cents = Math.round(amount * 100);
    const bucket = revenueBucket(readText(deal, DEAL_FIELDS.type));
    if (bucket === "new") newCents += cents;
    else if (bucket === "recurring") recurringCents += cents;
    else if (bucket === "repeat") repeatCents = (repeatCents ?? 0) + cents;
    else if (bucket === "reactivated") reactivatedCents = (reactivatedCents ?? 0) + cents;
  }

  return { newCents, repeatCents, recurringCents, reactivatedCents };
}

function objectionsFromDebriefs(
  debriefs: ForsightRecord[] | null,
  period: { start: string; end: string }
): Array<{ objection: string; count: number }> | null {
  if (debriefs === null) return null;
  const counts = new Map<string, number>();
  for (const row of debriefs) {
    if (!inPeriod(readDate(row, DEBRIEF_FIELDS.callDate), period.start, period.end)) continue;
    const objection = readText(row, DEBRIEF_FIELDS.objection);
    if (!objection || /^none$/i.test(objection)) continue;
    counts.set(objection, (counts.get(objection) ?? 0) + 1);
  }
  return [...counts.entries()].map(([objection, count]) => ({ objection, count }));
}
