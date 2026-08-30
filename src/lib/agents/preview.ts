import type { ExternalOperationId } from "@/lib/agents/types";

export type PlainLanguagePreview = {
  system: "crm" | "calendar";
  operation: ExternalOperationId;
  recordLabel: string;
  before: string;
  after: string;
  reversible: boolean;
  irreversibleLabel: string | null;
};

/**
 * Previews are sentences a person can read. A raw payload is never
 * the preview.
 */
export function previewExternalWrite(args: {
  operation: ExternalOperationId;
  system: "crm" | "calendar";
  recordLabel: string;
  before: string;
  after: string;
  reversible: boolean;
}): PlainLanguagePreview {
  return {
    system: args.system,
    operation: args.operation,
    recordLabel: args.recordLabel,
    before: args.before,
    after: args.after,
    reversible: args.reversible,
    irreversibleLabel: args.reversible
      ? null
      : "This change cannot be undone from Vistrial.",
  };
}

export function isRawPayloadPreview(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function previewShowsEveryRecord<T>(records: readonly T[], shown: readonly T[]): boolean {
  return records.length === shown.length;
}
