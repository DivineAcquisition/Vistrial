const SECRET = /(secret|token|password|api_key|encrypted|webhook)/i;
const INBOUND_BODY = /^(raw_body|body|message|html|email_body|message_body)$/i;
const OUTBOUND_BODY = /^(outbound_body|final_body|generated_body|edited_body|sent_body)$/i;
const TRANSCRIPT = /^(raw_transcript|transcript|transcript_text|quotes)$/i;

export type SanitizeOptions = {
  includeOutbound: boolean;
  includeTranscripts: boolean;
};

/** Drops secrets, inbound message text, and anything the requester did not explicitly include. */
export function sanitizeExportRow(row: Record<string, unknown>, options: SanitizeOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (SECRET.test(key) || INBOUND_BODY.test(key)) continue;
    if (OUTBOUND_BODY.test(key) && !options.includeOutbound) continue;
    if (TRANSCRIPT.test(key) && !options.includeTranscripts) continue;
    out[key] = value;
  }
  return out;
}

export function sanitizeExportTables(
  tables: Record<string, unknown[]>,
  options: SanitizeOptions
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [name, rows] of Object.entries(tables)) {
    if (name === "webhook_events" || name === "webhook_dead_letters") continue;
    out[name] = rows.map((row) =>
      row && typeof row === "object" && !Array.isArray(row)
        ? sanitizeExportRow(row as Record<string, unknown>, options)
        : row
    );
  }
  return out;
}

export const DATA_DICTIONARY = [
  { field: "leads.id", type: "uuid", values: "Stable identifier.", source: "Vistrial" },
  { field: "leads.source", type: "text", values: "The source label from the customer's tool, or manual, direct, or api.", source: "Connected tool or the person who entered it" },
  { field: "leads.status", type: "text", values: "new, working, call_booked, no_show, follow_up, objection_hold, ghost, closed_won, closed_lost", source: "Connected tool or a person" },
  { field: "leads.is_test", type: "boolean", values: "Practice rows are excluded from live reports.", source: "Vistrial" },
  { field: "touches", type: "object", values: "Metadata only unless an owner includes outbound messages they approved and sent.", source: "Connected tool or a person" },
  { field: "calls", type: "object", values: "Call metadata. Transcript text is omitted unless explicitly chosen and retention allows it.", source: "Connected tool" },
  { field: "revenue_log.amount_cents", type: "integer", values: "Cents. Refunds and chargebacks are separate rows.", source: "Payment source" },
  { field: "record_provenance.source_label", type: "text", values: "Which connection or API key wrote the row.", source: "Vistrial" },
] as const;
