/**
 * Google Drive, files the customer picks (docs/rebuild/integrations-setup.md, section 4b). With drive.file
 * Vistrial can open only files a person picked in Google's Picker. From each it keeps the text: Google Docs
 * and Slides as plain text, a Sheet's first sheet as CSV, plain text, Markdown or CSV files up to 2 MB.
 * Pure: which files are readable, where their text is read from, and how it is cleaned.
 */

export const DRIVE = {
  meta: (id: string) => `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,size,modifiedTime,trashed`,
  exportText: (id: string, mime: string) => `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(mime)}`,
  media: (id: string) => `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
  /** Most files a workspace keeps, and most one pick may add. */
  files: 50,
  perPick: 10,
  maxChars: 200_000,
  maxBytes: 2_000_000,
  /** How much of one file a read tool returns at a time. */
  piece: 20_000,
} as const;

/** Google file ids are letters, digits, dashes and underscores. */
export const isFileId = (id: string) => /^[A-Za-z0-9_-]{10,200}$/.test(id);

export type DriveKind = "doc" | "sheet" | "slides" | "text";

const GOOGLE_EXPORT: Record<string, { kind: DriveKind; as: string }> = {
  "application/vnd.google-apps.document": { kind: "doc", as: "text/plain" },
  "application/vnd.google-apps.presentation": { kind: "slides", as: "text/plain" },
  "application/vnd.google-apps.spreadsheet": { kind: "sheet", as: "text/csv" },
};
const PLAIN = new Set(["text/plain", "text/markdown", "text/csv", "text/x-markdown"]);

/** Where a file's text is read from, or why it cannot be. */
export function readPlan(meta: {
  mimeType?: unknown;
  size?: unknown;
  trashed?: unknown;
}): { ok: true; kind: DriveKind; url: (id: string) => string } | { ok: false; reason: "unsupported" | "too_large" | "trashed" } {
  if (meta.trashed === true) return { ok: false, reason: "trashed" };
  const mime = typeof meta.mimeType === "string" ? meta.mimeType : "";
  const google = GOOGLE_EXPORT[mime];
  if (google) return { ok: true, kind: google.kind, url: (id) => DRIVE.exportText(id, google.as) };
  if (PLAIN.has(mime)) {
    const size = Number(meta.size ?? 0);
    if (Number.isFinite(size) && size > DRIVE.maxBytes) return { ok: false, reason: "too_large" };
    return { ok: true, kind: "text", url: (id) => DRIVE.media(id) };
  }
  return { ok: false, reason: "unsupported" };
}

export const DRIVE_TEXT = {
  unsupported: "Vistrial reads Google Docs, Sheets, Slides and plain text files. Open a PDF or Word file in Google Docs first, then pick the Doc.",
  too_large: "That text file is larger than 2 MB.",
  trashed: "That file is in the Drive's bin.",
  not_found: "Vistrial cannot open that file. Pick it with the Google account Drive is connected as.",
  tooMany: `Vistrial keeps at most ${DRIVE.files} picked files. Remove one first.`,
} as const;

/** The text kept: line breaks kept, runs of spaces and blank lines folded, capped. */
export function cleanText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, DRIVE.maxChars);
}

export const wordCount = (text: string) => (text.match(/\S+/g) ?? []).length;

/** One piece of a file's text for a read tool, with where the next piece starts. */
export function pieceOf(text: string, start: number) {
  const from = Math.max(0, Math.min(Math.floor(start) || 0, text.length));
  const piece = text.slice(from, from + DRIVE.piece);
  const next = from + piece.length < text.length ? from + piece.length : null;
  return { piece, next };
}

export const KIND_WORD: Record<string, string> = { doc: "Google Doc", sheet: "Google Sheet", slides: "Google Slides", text: "Text file" };
