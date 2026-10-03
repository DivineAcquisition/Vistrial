import { isNumber, type MetricValue } from "@/lib/forsight/values";

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
