export type SubmissionRow = {
  id: string;
  kind: string;
  name: string;
  email: string;
  business: string;
  summary: string;
  fields: { label: string; value: string }[];
  pagePath: string;
  status: "new" | "reviewed" | "archived";
  emailStatus: "pending" | "sent" | "failed" | "skipped";
  emailError: string;
  createdAt: number;
};

const FIXED = ["Received (UTC)", "Type", "Name", "Email", "Business", "Status", "Email status", "Page"] as const;

function cell(value: string): string {
  // A leading =, +, -, or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per submission. Each form answer gets its own column, in the order first seen. */
export function submissionsCsv(rows: SubmissionRow[]): string {
  const labels: string[] = [];
  for (const row of rows) {
    for (const field of row.fields) if (!labels.includes(field.label)) labels.push(field.label);
  }
  const header = [...FIXED, ...labels];
  const lines = rows.map((row) => {
    const byLabel = new Map(row.fields.map((field) => [field.label, field.value]));
    return [
      new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 19),
      row.kind,
      row.name,
      row.email,
      row.business,
      row.status,
      row.emailStatus,
      row.pagePath,
      ...labels.map((label) => byLabel.get(label) ?? ""),
    ]
      .map(cell)
      .join(",");
  });
  // The byte order mark makes Excel read the file as UTF-8.
  return "﻿" + [header.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
