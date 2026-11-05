/** The internal alert sent to the team for each public form post. Pure, so it can be tested. */

export const SUBMISSION_KIND_LABELS: Record<string, string> = {
  private_access: "Private Access request",
  custom: "Custom contact",
  security_review: "Security review request",
  vulnerability: "Vulnerability report",
  lead_data_note: "Lead data request",
};

export type SubmissionForEmail = {
  kind: string;
  name: string;
  email: string;
  business?: string;
  summary: string;
  fields: { label: string; value: string }[];
  pagePath?: string;
  createdAt: number;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strips line breaks so a submitted value cannot add lines to the subject. */
function oneLine(text: string, max: number): string {
  return [...text.replace(/[\r\n\t]+/g, " ").trim()].slice(0, max).join("");
}

export function submissionEmail(row: SubmissionForEmail, adminUrl: string) {
  const label = SUBMISSION_KIND_LABELS[row.kind] ?? "Form submission";
  const who = oneLine(row.business ? `${row.name} (${row.business})` : row.name || row.email, 120);
  const subject = `New ${label}: ${who}`;
  const when = new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const lines: [string, string][] = [
    ["Type", label],
    ["Name", row.name],
    ["Email", row.email],
    ...(row.business ? ([["Business", row.business]] as [string, string][]) : []),
    ...row.fields.map((field) => [field.label, field.value] as [string, string]),
    ...(row.pagePath ? ([["Page", row.pagePath]] as [string, string][]) : []),
    ["Received", when],
  ];
  const text = [
    `${label} from the Vistrial site.`,
    "",
    ...lines.map(([key, value]) => `${key}: ${value}`),
    "",
    `All submissions: ${adminUrl}`,
  ].join("\n");
  const rows = lines
    .map(
      ([key, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;white-space:nowrap">${escapeHtml(key)}</td>` +
        `<td style="padding:6px 0;color:#111;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">` +
    `<p style="margin:0 0 12px">${escapeHtml(label)} from the Vistrial site.</p>` +
    `<table style="border-collapse:collapse">${rows}</table>` +
    `<p style="margin:16px 0 0"><a href="${escapeHtml(adminUrl)}">See all submissions</a></p></div>`;
  return { subject, text, html };
}
