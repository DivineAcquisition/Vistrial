export const MAX_LEAD_FILE_BYTES = 8_388_608;
export const MAX_CONTEXT_NOTES_CHARS = 8_000;

export const ALLOWED_LEAD_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type AllowedLeadFileType = (typeof ALLOWED_LEAD_FILE_TYPES)[number];

const ALLOWED = new Set<string>(ALLOWED_LEAD_FILE_TYPES);

export function isAllowedLeadFileType(value: string): value is AllowedLeadFileType {
  return ALLOWED.has(value);
}

export function sanitizeLeadFileName(name: string): string {
  const trimmed = name.replace(/[/\\]+/g, " ").replace(/\s+/g, " ").trim();
  const base = trimmed.slice(0, 180);
  return base || "attachment";
}

export function encodeLeadFileContents(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function decodeLeadFileContents(contents: string): Buffer {
  return Buffer.from(contents, "base64");
}
