import type { ReportingRange } from "@/lib/reporting/range";

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function section(title: string, rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return `${csvEscape(title)}\n(none)\n`;
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const header = keys.map(csvEscape).join(",");
  const body = rows.map((row) => keys.map((key) => csvEscape(row[key])).join(",")).join("\n");
  return `${csvEscape(title)}\n${header}\n${body}\n`;
}

export function reportingCsv(args: {
  orgName: string;
  orgSlug: string;
  range: ReportingRange;
  generatedAt: string;
  panels: Record<string, Record<string, unknown>>;
}): string {
  const stamp = [
    `org,${csvEscape(args.orgName)}`,
    `org_slug,${csvEscape(args.orgSlug)}`,
    `range_key,${csvEscape(args.range.key)}`,
    `range_start,${csvEscape(args.range.from)}`,
    `range_end,${csvEscape(args.range.to)}`,
    `generated_at,${csvEscape(args.generatedAt)}`,
  ].join("\n");

  const chunks = [stamp, ""];
  for (const [name, payload] of Object.entries(args.panels)) {
    chunks.push(section(name, flattenPayload(payload)));
    chunks.push("");
  }
  return chunks.join("\n");
}

function flattenPayload(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        rows.push({ field: key, value: "" });
        continue;
      }
      for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          rows.push({ field: key, ...(item as Record<string, unknown>) });
        } else {
          rows.push({ field: key, value: item });
        }
      }
    } else if (value && typeof value === "object") {
      rows.push({ field: key, ...(value as Record<string, unknown>) });
    } else {
      rows.push({ field: key, value });
    }
  }
  return rows;
}
