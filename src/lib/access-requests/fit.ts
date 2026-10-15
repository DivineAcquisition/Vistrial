export type FitRule = {
  id: string;
  field: string;
  in: string[];
  pass: string;
  fail: string;
};

export const DEFAULT_FIT_RULES: FitRule[] = [
  {
    id: "industry",
    field: "business_type",
    in: ["med-spa", "home-services", "coaches-consultants"],
    pass: "Industry matches a template.",
    fail: "Industry does not match a current template.",
  },
  {
    id: "crm",
    field: "crm",
    in: ["gohighlevel"],
    pass: "CRM is supported.",
    fail: "CRM is not a connector that works today.",
  },
  {
    id: "deal",
    field: "deal_value",
    in: ["1000_2500", "2500_10000", "above_10000"],
    pass: "Average deal value is in the target range.",
    fail: "Average deal value is below the range this page is written for.",
  },
  {
    id: "calls",
    field: "calls_per_week",
    in: ["5_20", "21_50"],
    pass: "Sales calls per week are within normal range.",
    fail: "Sales calls per week are outside the usual range.",
  },
];

export function parseFitRules(value: unknown): FitRule[] | null {
  if (!Array.isArray(value)) return null;
  const rules: FitRule[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const item = row as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.field !== "string") return null;
    if (typeof item.pass !== "string" || typeof item.fail !== "string") return null;
    if (!Array.isArray(item.in) || item.in.some((entry) => typeof entry !== "string")) return null;
    rules.push({
      id: item.id.slice(0, 40),
      field: item.field.slice(0, 40),
      in: item.in.map((entry) => String(entry).slice(0, 80)).slice(0, 20),
      pass: item.pass.slice(0, 200),
      fail: item.fail.slice(0, 200),
    });
  }
  return rules;
}

export function fitLines(answers: Record<string, string | null | undefined>, rules: FitRule[]): string[] {
  return rules.map((rule) => {
    const value = answers[rule.field];
    return value && rule.in.includes(value) ? rule.pass : rule.fail;
  });
}
