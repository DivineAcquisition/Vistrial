/** Choices on the access form. Labels are the public copy. Values are stored. */

export const BUSINESS_TYPES = [
  { value: "med-spa", label: "Aesthetic or medical spa" },
  { value: "home-services", label: "Home services or remodeling" },
  { value: "coaches-consultants", label: "Coaching, consulting, or programs" },
  { value: "other", label: "Other" },
] as const;

export const TEAM_SIZES = [
  { value: "1", label: "Just me" },
  { value: "2_5", label: "2 to 5" },
  { value: "6_15", label: "6 to 15" },
  { value: "16_plus", label: "More than 15" },
] as const;

export const LEAD_SOURCES = [
  { value: "crm", label: "CRM" },
  { value: "phone", label: "Phone or dialer" },
  { value: "calendar", label: "Calendar" },
  { value: "recordings", label: "Call or meeting recordings" },
  { value: "spreadsheets", label: "Spreadsheets" },
  { value: "other", label: "Other" },
] as const;

export const CRMS = [
  { value: "gohighlevel", label: "GoHighLevel" },
  { value: "hubspot", label: "HubSpot (coming)" },
  { value: "salesforce", label: "Salesforce (coming)" },
  { value: "other", label: "Other" },
  { value: "none", label: "None" },
] as const;

export const DEAL_VALUES = [
  { value: "under_1000", label: "Under $1,000" },
  { value: "1000_2500", label: "$1,000 to $2,500" },
  { value: "2500_10000", label: "$2,500 to $10,000" },
  { value: "above_10000", label: "Above $10,000" },
] as const;

export const CALLS_PER_WEEK = [
  { value: "under_5", label: "Fewer than 5" },
  { value: "5_20", label: "5 to 20" },
  { value: "21_50", label: "21 to 50" },
  { value: "above_50", label: "More than 50" },
] as const;

export const LEADS_PER_MONTH = [
  { value: "under_20", label: "Fewer than 20" },
  { value: "20_100", label: "20 to 100" },
  { value: "101_400", label: "101 to 400" },
  { value: "above_400", label: "More than 400" },
] as const;

export const CUSTOM_TEAM_SIZES = [
  { value: "", label: "Not sure" },
  { value: "1_15", label: "1 to 15" },
  { value: "16_50", label: "16 to 50" },
  { value: "51_plus", label: "More than 50" },
] as const;

export const CAMPAIGN_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "ref",
  "from",
] as const;

export type CampaignKey = (typeof CAMPAIGN_KEYS)[number];

const BUSINESS = new Set<string>(BUSINESS_TYPES.map((row) => row.value));
const TEAMS = new Set<string>([...TEAM_SIZES.map((row) => row.value), ...CUSTOM_TEAM_SIZES.map((row) => row.value)].filter(Boolean));
const SOURCES = new Set<string>(LEAD_SOURCES.map((row) => row.value));
const CRM = new Set<string>(CRMS.map((row) => row.value));
const DEALS = new Set<string>(DEAL_VALUES.map((row) => row.value));
const CALLS = new Set<string>(CALLS_PER_WEEK.map((row) => row.value));
const LEADS = new Set<string>(LEADS_PER_MONTH.map((row) => row.value));

export function isAllowed(value: string, kind: "business" | "team" | "source" | "crm" | "deal" | "calls" | "leads"): boolean {
  if (kind === "business") return BUSINESS.has(value);
  if (kind === "team") return TEAMS.has(value);
  if (kind === "source") return SOURCES.has(value);
  if (kind === "crm") return CRM.has(value);
  if (kind === "deal") return DEALS.has(value);
  if (kind === "calls") return CALLS.has(value);
  return LEADS.has(value);
}
