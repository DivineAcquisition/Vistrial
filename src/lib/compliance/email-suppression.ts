const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResendWebhookEvent = {
  type?: string;
  data?: {
    email_id?: string;
    tags?: unknown;
    bounce?: { type?: string };
  };
};

export type LeadSuppression = {
  orgId: string;
  leadId: string;
  reason: "bounced" | "complained";
  providerId: string | null;
};

/** Resend sends tags as { name: value } on webhooks and as [{ name, value }] when sending. */
function readTags(tags: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (tag && typeof tag === "object" && typeof tag.name === "string" && typeof tag.value === "string") {
        out[tag.name] = tag.value;
      }
    }
  } else if (tags && typeof tags === "object") {
    for (const [key, value] of Object.entries(tags as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
    }
  }
  return out;
}

/**
 * The lead an email event is about, when the email was sent to a lead.
 * Lead emails carry org_id and lead_id tags; anything without both (staff
 * notifications, reports) is not about a lead. A temporary bounce is not a
 * reason to stop emailing someone; a permanent bounce or a spam complaint is.
 */
export function leadSuppressionFromEvent(event: ResendWebhookEvent): LeadSuppression | null {
  const reason =
    event.type === "email.complained"
      ? "complained"
      : event.type === "email.bounced" && !/^transient$/i.test(event.data?.bounce?.type ?? "")
        ? "bounced"
        : null;
  if (!reason) return null;
  const tags = readTags(event.data?.tags);
  const orgId = tags.org_id ?? "";
  const leadId = tags.lead_id ?? "";
  if (!UUID.test(orgId) || !UUID.test(leadId)) return null;
  return { orgId, leadId, reason, providerId: event.data?.email_id?.slice(0, 200) ?? null };
}
