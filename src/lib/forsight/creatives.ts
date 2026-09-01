import { CREATIVE_FIELDS as F, readMetric, readText } from "@/lib/forsight/fields";
import type { ForsightRecord } from "@/lib/forsight/types";
import { compareMetricAscending, isNumber, type MetricValue } from "@/lib/forsight/values";

export type CreativeRow = {
  id: string;
  name: string;
  status: string;
  spend: MetricValue;
  ctr: MetricValue;
  costPerLead: MetricValue;
  costPerQualifiedLead: MetricValue;
  costPerAuditHeld: MetricValue;
  cac: MetricValue;
};

export function creativeRow(record: ForsightRecord): CreativeRow {
  return {
    id: record.id,
    name: readText(record, F.name) || "Unnamed creative",
    status: readText(record, F.status),
    spend: readMetric(record, F.spend),
    ctr: readMetric(record, F.ctr),
    costPerLead: readMetric(record, F.costPerLead),
    costPerQualifiedLead: readMetric(record, F.costPerQualifiedLead),
    costPerAuditHeld: readMetric(record, F.costPerAuditHeld),
    cac: readMetric(record, F.cac),
  };
}

/**
 * Best performer on top, judged on cost per audit held. Creatives that have not
 * produced an audit yet fall underneath the ones that have, rather than
 * sorting as zero and taking the top of a table that exists to answer
 * "which of these should I scale".
 */
export function creativesByCostPerAuditHeld(records: ForsightRecord[]): CreativeRow[] {
  return records
    .map(creativeRow)
    .sort(
      (a, b) =>
        compareMetricAscending(a.costPerAuditHeld, b.costPerAuditHeld) ||
        a.name.localeCompare(b.name)
    );
}

/** Summing a column for a footer is presentation. Dividing would not be. */
export function totalSpend(rows: CreativeRow[]): MetricValue {
  const spends = rows.map((row) => row.spend).filter(isNumber);
  if (spends.length === 0) return { kind: "absent" };
  return {
    kind: "number",
    value: spends.reduce((sum, spend) => sum + spend.value, 0),
    raw: "",
  };
}

/** Only the creatives with a real cost per audit held can be compared side by side. */
export function comparableByCostPerAuditHeld(
  rows: CreativeRow[]
): Array<{ label: string; value: number }> {
  return rows
    .filter((row) => isNumber(row.costPerAuditHeld))
    .map((row) => ({
      label: row.name,
      value: (row.costPerAuditHeld as { value: number }).value,
    }));
}
