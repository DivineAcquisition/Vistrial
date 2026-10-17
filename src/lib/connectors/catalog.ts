/**
 * The connector catalog. Screens and OAuth scopes read this list.
 * A connector that requests a scope missing from its approved list fails the test.
 */

export const CONNECTOR_CATEGORIES = [
  { id: "crm", label: "CRM" },
  { id: "calendars", label: "Calendars" },
  { id: "calls", label: "Calls and transcripts" },
  { id: "data", label: "Data apps and spreadsheets" },
  { id: "forms", label: "Forms and automations" },
  { id: "import", label: "Import and manual entry" },
] as const;

export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number]["id"];

export type ConnectMethod = "oauth" | "api_key" | "webhook" | "upload" | "manual";

export type ConnectorAvailability = "connect" | "coming_soon" | "notify";

export type ScopeReason = { scope: string; reason: string };

export type ConnectorDefinition = {
  key: string;
  version: string;
  name: string;
  category: ConnectorCategory;
  method: ConnectMethod;
  methodLabel: string;
  summary: string;
  reads: string[];
  doesNotRead: string;
  neverDoes: string;
  permissions: ScopeReason[];
  /** Required to proceed. A missing one stops the connection. */
  requiredScopes: string[];
  availability: ConnectorAvailability;
  /** On by default for every workspace. Others wait for a Platform Admin. */
  defaultEnabled: boolean;
  countsTowardLimit: boolean;
  /** Rows that share a group count as one connection. */
  limitGroup: "calendar" | null;
  delayMs: number;
  /** A quiet stretch is not a failure when the last full check succeeded. */
  quietIsOk: boolean;
  scheduledCheckMs: number | null;
  firstImport: string;
  testModeNote: string | null;
  beta: boolean;
};

const HISTORIC =
  "Past records come in silently. They will not trigger alerts, tasks, or follow-up drafts.";

export const CONNECTORS: ConnectorDefinition[] = [
  {
    key: "gohighlevel",
    version: "1",
    name: "GoHighLevel",
    category: "crm",
    method: "oauth",
    methodLabel: "Sign in",
    summary: "Contacts, pipelines, appointments, and conversation activity.",
    reads: [
      "Contacts",
      "Pipelines and stages",
      "Appointments",
      "Call records",
      "Conversation activity: type, direction, channel, time, status, and owner",
    ],
    doesNotRead:
      "Vistrial does not keep the text of messages your leads send you. It keeps that a message happened, when, and on which channel.",
    neverDoes:
      "Vistrial will not change anything in GoHighLevel. Sending an approved follow-up and any updates back to GoHighLevel are off unless you turn them on.",
    permissions: [
      { scope: "contacts.readonly", reason: "Read contacts so leads can show up in Vistrial." },
      { scope: "contacts.write", reason: "Send an approved follow-up back, only after you turn sending on." },
      { scope: "conversations.readonly", reason: "Read that a conversation happened, not the message text." },
      { scope: "conversations.write", reason: "Send an approved follow-up on the channel you choose." },
      { scope: "conversations/message.readonly", reason: "Read message type, time, and direction. The text is dropped." },
      { scope: "conversations/message.write", reason: "Send an approved message after you turn sending on." },
      { scope: "locations.readonly", reason: "Read the sub-account name so you can see what you connected." },
      { scope: "locations/customFields.readonly", reason: "Show your custom fields so you can match them." },
      { scope: "opportunities.readonly", reason: "Read pipelines, stages, and open opportunities." },
      { scope: "calendars.readonly", reason: "List the calendars in this sub-account." },
      { scope: "calendars/events.readonly", reason: "Read appointment times and status." },
      { scope: "users.readonly", reason: "Match HighLevel users to people in this workspace." },
      { scope: "oauth.readonly", reason: "See which permissions were actually granted." },
      { scope: "oauth.write", reason: "Refresh access before it expires, and revoke it when you disconnect." },
    ],
    requiredScopes: [
      "contacts.readonly",
      "locations.readonly",
      "opportunities.readonly",
      "calendars.readonly",
      "calendars/events.readonly",
      "users.readonly",
      "conversations.readonly",
      "conversations/message.readonly",
    ],
    availability: "connect",
    defaultEnabled: true,
    countsTowardLimit: true,
    limitGroup: null,
    delayMs: 30 * 60 * 1000,
    quietIsOk: false,
    scheduledCheckMs: 15 * 60 * 1000,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: false,
  },
  {
    key: "hubspot",
    version: "1",
    name: "HubSpot",
    category: "crm",
    method: "oauth",
    methodLabel: "Sign in",
    summary: "Contacts, companies, and deals.",
    reads: ["Contacts", "Companies", "Deals and stages"],
    doesNotRead:
      "Vistrial does not keep the text of messages your leads send you. It keeps that a message happened, when, and on which channel.",
    neverDoes:
      "Vistrial will not change anything in HubSpot. Sending an approved follow-up and any updates back to HubSpot are off unless you turn them on.",
    permissions: [
      { scope: "crm.objects.contacts.read", reason: "Read contacts." },
      { scope: "crm.objects.companies.read", reason: "Read companies linked to those contacts." },
      { scope: "crm.objects.deals.read", reason: "Read deals and stages." },
      { scope: "oauth", reason: "See the account name and refresh access." },
    ],
    requiredScopes: ["crm.objects.contacts.read", "crm.objects.deals.read", "oauth"],
    availability: "connect",
    defaultEnabled: false,
    countsTowardLimit: true,
    limitGroup: null,
    delayMs: 30 * 60 * 1000,
    quietIsOk: false,
    scheduledCheckMs: 15 * 60 * 1000,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: true,
  },
  {
    key: "salesforce",
    version: "1",
    name: "Salesforce",
    category: "crm",
    method: "oauth",
    methodLabel: "Sign in",
    summary: "Leads and opportunities, when this connector is built.",
    reads: [],
    doesNotRead: "Nothing is read yet.",
    neverDoes: "Vistrial will not change anything in Salesforce.",
    permissions: [],
    requiredScopes: [],
    availability: "notify",
    defaultEnabled: false,
    countsTowardLimit: true,
    limitGroup: null,
    delayMs: 30 * 60 * 1000,
    quietIsOk: false,
    scheduledCheckMs: null,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: false,
  },
  {
    key: "google_calendar",
    version: "1",
    name: "Google Calendar",
    category: "calendars",
    method: "oauth",
    methodLabel: "Sign in",
    summary: "Sales calls on the calendars your team connects.",
    reads: [
      "Start and end time of a matched event",
      "Whether it is confirmed or canceled",
      "The lead it matches",
      "The team member whose calendar it is on",
      "Whether the meeting is by phone, video, or in person",
    ],
    doesNotRead:
      "Vistrial does not store event descriptions, notes, or other attendees. Events that are not a known lead and not a sales call are ignored.",
    neverDoes: "Vistrial will not change anything in Google Calendar. It only reads.",
    permissions: [
      {
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        reason: "Read event times so booked calls can show on the lead. Vistrial does not edit the calendar.",
      },
    ],
    requiredScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    availability: "connect",
    defaultEnabled: false,
    countsTowardLimit: true,
    limitGroup: "calendar",
    delayMs: 45 * 60 * 1000,
    quietIsOk: false,
    scheduledCheckMs: 15 * 60 * 1000,
    firstImport: HISTORIC,
    testModeNote:
      "This calendar connection is in testing and needs to be reconnected about once a week until Google finishes its review.",
    beta: true,
  },
  {
    key: "outlook",
    version: "1",
    name: "Outlook Calendar",
    category: "calendars",
    method: "oauth",
    methodLabel: "Sign in",
    summary: "Sales calls on Outlook calendars. Available after Google Calendar is approved.",
    reads: [],
    doesNotRead: "Nothing is read yet.",
    neverDoes: "Vistrial will not change anything in Outlook.",
    permissions: [],
    requiredScopes: [],
    availability: "coming_soon",
    defaultEnabled: false,
    countsTowardLimit: true,
    limitGroup: "calendar",
    delayMs: 45 * 60 * 1000,
    quietIsOk: false,
    scheduledCheckMs: 15 * 60 * 1000,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: false,
  },
  {
    key: "fathom",
    version: "1",
    name: "Fathom",
    category: "calls",
    method: "api_key",
    methodLabel: "API key",
    summary: "Call recordings and transcripts from this workspace's own Fathom account.",
    reads: ["Call time, duration, participants' emails, and the transcript"],
    doesNotRead: "Vistrial does not read calls that do not match a lead in this workspace.",
    neverDoes: "Vistrial will not change anything in Fathom.",
    permissions: [{ scope: "api_key", reason: "Read meetings from the Fathom account you connect." }],
    requiredScopes: ["api_key"],
    availability: "connect",
    defaultEnabled: false,
    countsTowardLimit: true,
    limitGroup: null,
    delayMs: 45 * 60 * 1000,
    quietIsOk: false,
    scheduledCheckMs: 15 * 60 * 1000,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: true,
  },
  {
    key: "fireflies",
    version: "1",
    name: "Fireflies",
    category: "calls",
    method: "api_key",
    methodLabel: "API key",
    summary: "Call recordings and transcripts from this workspace's own Fireflies account.",
    reads: ["Call time, duration, participants' emails, and the transcript"],
    doesNotRead: "Vistrial does not read calls that do not match a lead in this workspace.",
    neverDoes: "Vistrial will not change anything in Fireflies.",
    permissions: [{ scope: "api_key", reason: "Read transcripts from the Fireflies account you connect." }],
    requiredScopes: ["api_key"],
    availability: "connect",
    defaultEnabled: false,
    countsTowardLimit: true,
    limitGroup: null,
    delayMs: 45 * 60 * 1000,
    quietIsOk: false,
    scheduledCheckMs: 15 * 60 * 1000,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: true,
  },
  {
    key: "airtable",
    version: "1",
    name: "Airtable",
    category: "data",
    method: "oauth",
    methodLabel: "Sign in",
    summary: "Rows from the bases you choose on Airtable's own approval page.",
    reads: ["The tables you pick for leads, activity, bookings, and outcomes", "Formula and lookup values as plain values"],
    doesNotRead: "Vistrial does not copy attachments. It does not read bases you did not approve.",
    neverDoes: "Vistrial will not change anything in Airtable.",
    permissions: [
      { scope: "data.records:read", reason: "Read the rows in the bases you select." },
      { scope: "schema.bases:read", reason: "Show table and column names so you can match them." },
      {
        scope: "webhook:manage",
        reason: "Hear when a row changes. This does not let Vistrial edit your base.",
      },
    ],
    requiredScopes: ["data.records:read", "schema.bases:read"],
    availability: "connect",
    defaultEnabled: false,
    countsTowardLimit: true,
    limitGroup: null,
    delayMs: 45 * 60 * 1000,
    quietIsOk: false,
    scheduledCheckMs: 15 * 60 * 1000,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: true,
  },
  {
    key: "generic_webhook",
    version: "1",
    name: "Webhook",
    category: "forms",
    method: "webhook",
    methodLabel: "Webhook",
    summary: "Any tool that can send a webhook, using Vistrial's published format.",
    reads: ["The fields in the published payload: people, activity, bookings, and outcomes"],
    doesNotRead:
      "Vistrial does not keep message text. Unknown fields are ignored and listed by name only.",
    neverDoes: "Vistrial does not call your tool back, and it does not write into it.",
    permissions: [],
    requiredScopes: [],
    availability: "connect",
    defaultEnabled: true,
    countsTowardLimit: false,
    limitGroup: null,
    delayMs: 45 * 60 * 1000,
    quietIsOk: true,
    scheduledCheckMs: null,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: false,
  },
  {
    key: "file_upload",
    version: "1",
    name: "Spreadsheet upload",
    category: "import",
    method: "upload",
    methodLabel: "Upload",
    summary: "A spreadsheet of people, interactions, bookings, or outcomes.",
    reads: ["The columns you match"],
    doesNotRead: "Vistrial does not keep the raw file after 7 days.",
    neverDoes: "Vistrial does not write the file back to another tool.",
    permissions: [],
    requiredScopes: [],
    availability: "connect",
    defaultEnabled: true,
    countsTowardLimit: false,
    limitGroup: null,
    delayMs: 0,
    quietIsOk: true,
    scheduledCheckMs: null,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: false,
  },
  {
    key: "manual",
    version: "1",
    name: "Add records by hand",
    category: "import",
    method: "manual",
    methodLabel: "Manual",
    summary: "A person types a record. The source shows who entered it.",
    reads: ["What the person types"],
    doesNotRead: "Nothing is pulled from another tool.",
    neverDoes: "Vistrial does not send the record to another tool.",
    permissions: [],
    requiredScopes: [],
    availability: "connect",
    defaultEnabled: true,
    countsTowardLimit: false,
    limitGroup: null,
    delayMs: 0,
    quietIsOk: true,
    scheduledCheckMs: null,
    firstImport: HISTORIC,
    testModeNote: null,
    beta: false,
  },
];

const BY_KEY = new Map(CONNECTORS.map((row) => [row.key, row]));

export function connectorByKey(key: string): ConnectorDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export function approvedScopeSet(key: string): Set<string> {
  const connector = connectorByKey(key);
  return new Set(connector?.permissions.map((row) => row.scope) ?? []);
}

/** Throws when a connector asks for a scope that is not on its approved list. */
export function assertApprovedScopes(key: string, requested: readonly string[]): void {
  const approved = approvedScopeSet(key);
  const extra = requested.filter((scope) => !approved.has(scope));
  if (extra.length > 0) {
    throw new Error(`Unapproved scopes for ${key}: ${extra.join(", ")}`);
  }
}

export function missingRequiredScopes(key: string, granted: readonly string[]): string[] {
  const connector = connectorByKey(key);
  if (!connector) return [];
  const have = new Set(granted);
  return connector.requiredScopes.filter((scope) => !have.has(scope));
}

export const ACCOUNT_ALREADY_CONNECTED =
  "This account is already connected to another Vistrial workspace. Contact your team if you need help.";

export const ATTEMPT_REJECTED =
  "This connection link expired or was opened in a different session. Please try again.";

export const CONNECTION_CANCELED = "Connection canceled. Nothing was changed.";

export const PLAN_LIMIT_LINE = (limit: number) => `Your plan includes ${limit} connections`;
