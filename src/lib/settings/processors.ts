export type ConnectedProcessor = {
  name: string;
  what: string;
  connected: boolean;
};

export function connectedProcessors(input: {
  crmConnected: boolean;
  smsEmergenciesEnabled: boolean;
  hasPushSubscriptions: boolean;
}): ConnectedProcessor[] {
  return [
    { name: "Supabase", what: "Database, auth, and application storage", connected: true },
    { name: "Vercel", what: "Application hosting", connected: true },
    { name: "Anthropic", what: "Extraction and follow-up drafting", connected: true },
    { name: "GoHighLevel", what: "CRM and messaging", connected: input.crmConnected },
    { name: "Resend", what: "Operator email notifications", connected: true },
    { name: "Twilio", what: "Emergency SMS alerts", connected: input.smsEmergenciesEnabled },
    { name: "Web Push", what: "Browser alerts to operators", connected: input.hasPushSubscriptions },
  ].filter((row) => row.connected);
}
