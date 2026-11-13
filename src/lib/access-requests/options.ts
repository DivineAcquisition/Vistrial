/** Choices on the access form. Labels are the public copy. Values are stored. */

export const BUSINESS_TYPES = [
  { value: "agency", label: "Agency" },
  { value: "consulting", label: "Consulting" },
  { value: "coaching", label: "Coaching" },
  { value: "info-products", label: "Courses, programs, or memberships" },
  { value: "other", label: "Other" },
] as const;

export const TEAM_SIZES = [
  { value: "1", label: "Just me" },
  { value: "2_5", label: "2 to 5" },
  { value: "6_15", label: "6 to 15" },
  { value: "16_plus", label: "More than 15" },
] as const;

/** How many client businesses the team does this work for. An agency answers with its client count. */
export const CLIENT_COUNTS = [
  { value: "own", label: "Only my own business" },
  { value: "1_5", label: "1 to 5 clients" },
  { value: "6_20", label: "6 to 20 clients" },
  { value: "21_plus", label: "More than 20 clients" },
] as const;

export const CHANNELS = [
  { value: "meta_ads", label: "Meta ads" },
  { value: "google_ads", label: "Google ads" },
  { value: "content", label: "Content and social" },
  { value: "email", label: "Email list" },
  { value: "referrals", label: "Referrals" },
  { value: "outbound", label: "Outbound" },
  { value: "other", label: "Other" },
] as const;

export const AD_SPEND = [
  { value: "none", label: "None yet" },
  { value: "under_1000", label: "Under $1,000" },
  { value: "1000_5000", label: "$1,000 to $5,000" },
  { value: "5000_20000", label: "$5,000 to $20,000" },
  { value: "above_20000", label: "Above $20,000" },
] as const;

export const OFFER_PRICES = [
  { value: "under_1000", label: "Under $1,000" },
  { value: "1000_2500", label: "$1,000 to $2,500" },
  { value: "2500_10000", label: "$2,500 to $10,000" },
  { value: "above_10000", label: "Above $10,000" },
] as const;

/** One per Strategist skill that is available today, in the reader's words. */
export const FIRST_WANTS = [
  { value: "market_research", label: "Research on my market and competitors" },
  { value: "offer_analysis", label: "My offer set beside competitors'" },
  { value: "growth_diagnosis", label: "Where my growth stalls" },
  { value: "ad_creative", label: "Ad copy and creative to test" },
  { value: "page_teardown", label: "A teardown of my landing page" },
  { value: "not_sure", label: "Not sure yet" },
] as const;

/** Figures the business could share so a change can be measured. Nothing is connected from this form. */
export const FIGURES = [
  { value: "meta", label: "A Meta ad account" },
  { value: "file", label: "A results spreadsheet" },
  { value: "both", label: "Both" },
  { value: "none", label: "Neither yet" },
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

const ALLOWED = {
  business: new Set<string>(BUSINESS_TYPES.map((row) => row.value)),
  team: new Set<string>([...TEAM_SIZES.map((row) => row.value), ...CUSTOM_TEAM_SIZES.map((row) => row.value)].filter(Boolean)),
  clients: new Set<string>(CLIENT_COUNTS.map((row) => row.value)),
  channel: new Set<string>(CHANNELS.map((row) => row.value)),
  spend: new Set<string>(AD_SPEND.map((row) => row.value)),
  price: new Set<string>(OFFER_PRICES.map((row) => row.value)),
  want: new Set<string>(FIRST_WANTS.map((row) => row.value)),
  figures: new Set<string>(FIGURES.map((row) => row.value)),
} as const;

export function isAllowed(value: string, kind: keyof typeof ALLOWED): boolean {
  return ALLOWED[kind].has(value);
}
