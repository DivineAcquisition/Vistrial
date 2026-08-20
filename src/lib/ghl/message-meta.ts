import type { Enums } from "@/types/database";

type TouchChannel = Enums<"touch_channel">;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function pick(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
}

export function contactFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return (
    asRecord(payload.contact) ??
    asRecord(payload.data) ??
    payload
  );
}

export function mapMessageChannel(messageType: string | null): TouchChannel {
  const value = (messageType ?? "").toLowerCase();
  if (value.includes("email")) return "email";
  if (value.includes("sms") || value.includes("text")) return "sms";
  if (value.includes("whatsapp") || value.includes("facebook") || value.includes("instagram") || value.includes("live") || value.includes("webchat") || value.includes("ig") || value.includes("fb") || value.includes("custom")) {
    return "dm";
  }
  if (value.includes("voicemail")) return "voicemail";
  if (value.includes("call")) return "call";
  return "other";
}

export function channelToGhlType(channel: TouchChannel): "SMS" | "Email" | "WhatsApp" | "IG" | "Custom" | null {
  if (channel === "sms") return "SMS";
  if (channel === "email") return "Email";
  if (channel === "dm") return "WhatsApp";
  return null;
}

/**
 * Automation / campaign / workflow sends are system touches.
 * A GHL user id is not enough — workflows can still include a userId.
 */
export function isAutomationOutbound(payload: Record<string, unknown>): boolean {
  const type = `${pick(payload, ["messageType", "type", "source"]) ?? ""}`.toLowerCase();
  if (payload.automated === true) return true;
  if (/(campaign|workflow|bulk|automation|type_campaign)/.test(type)) return true;
  const source = `${payload.source ?? payload.conversationProvider ?? ""}`.toLowerCase();
  if (/(workflow|campaign|bulk|automation)/.test(source)) return true;
  return false;
}

export function inboundTouchSummary(channel: TouchChannel): string {
  return `Inbound ${channel} received`;
}

export function outboundTouchSummary(channel: TouchChannel, kind: "system" | "human"): string {
  return kind === "system" ? `Outbound ${channel} sent by automation` : `Outbound ${channel} sent`;
}

export function messageIdFromPayload(payload: Record<string, unknown>): string | null {
  return pick(payload, ["messageId", "message_id", "id"]);
}

export function occurredAtFromPayload(payload: Record<string, unknown>): string {
  return (
    pick(payload, ["dateAdded", "timestamp", "date", "createdAt"]) ??
    new Date().toISOString()
  );
}

export type CallOutcome = "held" | "no_show" | "cancelled" | "rescheduled";

export function mapAppointmentOutcome(status: string | null): CallOutcome | null {
  if (!status) return null;
  const value = status.toLowerCase().replace(/[\s-]+/g, "_");
  if (value.includes("noshow") || value.includes("no_show")) return "no_show";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("resched")) return "rescheduled";
  if (value === "showed" || value === "completed" || value === "held" || value.includes("complete")) {
    return "held";
  }
  return null;
}

export function contactIsSuppressed(
  contact: Record<string, unknown>,
  channel: "sms" | "email" | "dm"
): string | null {
  if (contact.dnd === true) return "ghl_dnd";
  const settings = (contact.dndSettings ?? contact.dnd_settings) as Record<string, { status?: string }> | undefined;
  if (settings) {
    const key = channel === "sms" ? "SMS" : channel === "email" ? "Email" : "WhatsApp";
    const status = settings[key]?.status ?? settings[key.toLowerCase()]?.status;
    if (status && status.toLowerCase() === "active") return `ghl_dnd_${channel}`;
  }
  if (channel === "email" && (contact.validEmail === false || contact.unsubscribeEmail === true)) {
    return "ghl_email_unsubscribed";
  }
  if (channel === "sms" && (contact.validPhone === false || contact.unsubscribeSms === true)) {
    return "ghl_sms_unsubscribed";
  }
  return null;
}

export function appointmentFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return asRecord(payload.appointment) ?? asRecord(payload.data) ?? payload;
}
