/**
 * The two reminder emails a workspace's Owners and Admins get: a check-in is due, and a report is ready
 * for review. Pure, so the words can be tested. They carry the report title or the action text and nothing
 * else from the workspace: no figures, no source excerpts.
 */

export const REMINDER_FROM = "Vistrial <forms@mail.vistrial.io>";
export const DEFAULT_APP_URL = "https://app.vistrial.io";
/** The most check-ins one email lists. The rest are counted in one line. */
export const MAX_LISTED = 10;

const KIND_TAB = {
  marketReport: "Research",
  offerAnalysis: "Offers",
  growthDiagnosis: "Diagnostics",
} as const;

export type ReportKind = keyof typeof KIND_TAB;

export function isReportKind(kind: string): kind is ReportKind {
  return Object.hasOwn(KIND_TAB, kind);
}

/** Where the report sits in the app, in the words the sidebar uses. */
export function tabWords(kind: ReportKind): string {
  return `Growth Architect, ${KIND_TAB[kind]} tab`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line, cut on a word where it can be, so a long action reads as "a few words". */
export function fewWords(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = [...flat];
  if (chars.length <= max) return flat.replace(/[.\s]+$/, "");
  const cut = chars.slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[.,;:\s]+$/, "")}…`;
}

function shortDate(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function appBase(appUrl: string): string {
  return appUrl.replace(/\/+$/, "");
}

export type ReminderEmail = { subject: string; text: string; html: string };

function layout(input: { lines: string[]; list?: string[]; button: { label: string; url: string }; why: string; settingsUrl: string }): Pick<ReminderEmail, "text" | "html"> {
  const text = [
    ...input.lines,
    ...(input.list?.length ? ["", ...input.list.map((row) => `- ${row}`)] : []),
    "",
    `${input.button.label}: ${input.button.url}`,
    "",
    "--",
    input.why,
    `Turn these emails off in Settings, You: ${input.settingsUrl}`,
  ].join("\n");
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:520px">` +
    input.lines.map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`).join("") +
    (input.list?.length ? `<ul style="margin:0 0 12px;padding-left:20px">${input.list.map((row) => `<li style="margin:0 0 4px">${escapeHtml(row)}</li>`).join("")}</ul>` : "") +
    `<p style="margin:20px 0"><a href="${escapeHtml(input.button.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(input.button.label)}</a></p>` +
    `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #e5e5e5;font-size:12px;color:#666">${escapeHtml(input.why)} ` +
    `<a href="${escapeHtml(input.settingsUrl)}" style="color:#666">Turn these emails off in Settings, You</a>.</p></div>`;
  return { text, html };
}

function settingsUrl(appUrl: string): string {
  return `${appBase(appUrl)}/app/settings?section=you`;
}

/** One email for every check-in a person has due, oldest first. `items` must not be empty. */
export function checkInDueEmail(input: { workspaceName: string; items: { action: string; checkInAt: number }[]; appUrl: string }): ReminderEmail {
  const items = [...input.items].sort((a, b) => a.checkInAt - b.checkInAt);
  const first = fewWords(items[0].action, 70);
  const subject = items.length === 1 ? `Check-in due: ${first}` : `${items.length} check-ins due: ${fewWords(items[0].action, 50)} and ${items.length - 1} more`;
  const shown = items.slice(0, MAX_LISTED);
  const list = shown.map((row) => `${fewWords(row.action, 90)} (due ${shortDate(row.checkInAt)})`);
  if (items.length > shown.length) list.push(`and ${items.length - shown.length} more`);
  const workspace = fewWords(input.workspaceName, 80);
  const body = layout({
    lines: [
      items.length === 1 ? "A decision you planned is ready for its check-in." : `${items.length} decisions you planned are ready for their check-ins.`,
      "Say what happened, so the next research starts from what worked.",
    ],
    list,
    button: { label: items.length === 1 ? "Record what happened" : "Open your check-ins", url: `${appBase(input.appUrl)}/app` },
    why: `You got this because you are an Owner or Admin of ${workspace} on Vistrial and have "Check-ins due" emails on.`,
    settingsUrl: settingsUrl(input.appUrl),
  });
  return { subject, ...body };
}

/** One email for a report version that waits for a person: a draft to approve, or one that failed its checks. */
export function reportReadyEmail(input: {
  workspaceName: string;
  title: string;
  kind: ReportKind;
  needsReview: boolean;
  assetId: string;
  appUrl: string;
}): ReminderEmail {
  const title = fewWords(input.title, 120);
  const workspace = fewWords(input.workspaceName, 80);
  const body = layout({
    lines: [
      input.needsReview ? `"${title}" is saved, but it did not pass its checks.` : `"${title}" is ready for you to read and approve.`,
      `You will find it under ${tabWords(input.kind)}.`,
      input.needsReview ? "Edit it or reject it. Nothing builds on it until you do." : "Nothing builds on it until you approve it.",
    ],
    button: { label: input.needsReview ? "Review the report" : "Open the report", url: `${appBase(input.appUrl)}/app/assets/${input.assetId}` },
    why: `You got this because you are an Owner or Admin of ${workspace} on Vistrial and have "Report ready" emails on.`,
    settingsUrl: settingsUrl(input.appUrl),
  });
  return { subject: input.needsReview ? `Report needs review: ${fewWords(input.title, 80)}` : `Report ready: ${fewWords(input.title, 80)}`, ...body };
}
