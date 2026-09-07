export const GHL_EVENT_KINDS = [
  "contact_created",
  "contact_updated",
  "inbound_message",
  "outbound_message",
  "appointment_booked",
  "appointment_status",
  "opportunity_stage",
  "install",
  "uninstall",
  "ignored",
] as const;

export type GhlEventKind = (typeof GHL_EVENT_KINDS)[number];

const ALIASES: Record<string, GhlEventKind> = {
  contactcreate: "contact_created",
  "contact.create": "contact_created",
  contactcreated: "contact_created",
  contactupdate: "contact_updated",
  "contact.update": "contact_updated",
  contactupdated: "contact_updated",
  inboundmessage: "inbound_message",
  "inbound.message": "inbound_message",
  inboundmessagereceived: "inbound_message",
  outboundmessage: "outbound_message",
  "outbound.message": "outbound_message",
  outboundmessagesent: "outbound_message",
  outboundcall: "outbound_message",
  inboundcall: "inbound_message",
  appointmentcreate: "appointment_booked",
  "appointment.create": "appointment_booked",
  appointmentcreated: "appointment_booked",
  appointmentbooked: "appointment_booked",
  appointmentupdate: "appointment_status",
  "appointment.update": "appointment_status",
  appointmentupdated: "appointment_status",
  appointmentstatus: "appointment_status",
  appointmentstatuschanged: "appointment_status",
  opportunityupdate: "opportunity_stage",
  "opportunity.update": "opportunity_stage",
  opportunityupdated: "opportunity_stage",
  opportunitystagechanged: "opportunity_stage",
  install: "install",
  uninstall: "uninstall",
  appinstall: "install",
  appuninstall: "uninstall",
};

export function normalizeEventKind(eventType: string): GhlEventKind {
  const key = eventType.trim().toLowerCase().replace(/[\s_-]+/g, "");
  // Keep dots as separators in lookup by also trying dotted form.
  const dotted = eventType.trim().toLowerCase();
  return ALIASES[key] ?? ALIASES[dotted] ?? "ignored";
}
