/**
 * Acquisition channels. An offer that works on one channel can fail on another: a cold scroller on Meta
 * needs a different offer from someone who searched "move-out cleaning near me". Every change the analysis
 * proposes targets one channel, is backed by evidence from that channel, and is measured the way that
 * channel is measured. All of it is decided here, in code.
 */

/** Built on the "core four" of lead generation (warm, content, cold, paid), with search split out from paid. */
export const CHANNELS = ["paidSocial", "search", "content", "coldOutreach", "warm"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_WORDS: Record<Channel, string> = {
  paidSocial: "Paid social (Meta, TikTok and similar ads)",
  search: "Search (Google, Maps, local listings)",
  content: "Organic content (posts, video, SEO articles)",
  coldOutreach: "Cold outreach (calls, door-knocking, mail, cold email)",
  warm: "Warm (past customers, referrals, your list)",
};

/** How warm the audience on each channel usually is, for matching an offer to it. */
export const CHANNEL_TEMPERATURE: Record<Channel, "cold" | "intent" | "warm"> = {
  paidSocial: "cold",
  search: "intent",
  content: "cold",
  coldOutreach: "cold",
  warm: "warm",
};

/** Which collected source platforms can show what competitors lead with on each channel. */
export const EVIDENCE_PLATFORMS: Record<Channel, readonly string[]> = {
  paidSocial: ["metaAdLibrary"],
  // A competitor's site is where search traffic lands, and what referrals and outreach point to.
  search: ["web"],
  content: ["youtube", "tiktok", "instagram"],
  coldOutreach: ["web"],
  warm: ["web"],
};

/** The channel a collected competitor source shows an offer on, or null when it shows none. */
export function channelOfPlatform(platform: string): Channel | null {
  if (platform === "metaAdLibrary") return "paidSocial";
  if (platform === "youtube" || platform === "tiktok" || platform === "instagram") return "content";
  if (platform === "web") return "search";
  return null;
}

export const METRICS = [
  "bookings",
  "revenue",
  "averageOrderValue",
  "costPerLead",
  "costPerBooking",
  "clickThroughRate",
  "leadToBookingRate",
  "callVolume",
  "conversionRate",
  "inquiries",
  "replyRate",
  "bookedCalls",
  "closeRate",
  "referralsPerMonth",
  "repeatPurchaseRate",
] as const;
export type Metric = (typeof METRICS)[number];

const ANY_CHANNEL: readonly Metric[] = ["bookings", "revenue", "averageOrderValue"];

/** The measures that tell whether an offer worked on each channel. */
export const CHANNEL_METRICS: Record<Channel, readonly Metric[]> = {
  paidSocial: [...ANY_CHANNEL, "costPerLead", "costPerBooking", "clickThroughRate", "leadToBookingRate"],
  search: [...ANY_CHANNEL, "callVolume", "conversionRate", "costPerLead", "costPerBooking"],
  content: [...ANY_CHANNEL, "inquiries", "leadToBookingRate"],
  coldOutreach: [...ANY_CHANNEL, "replyRate", "bookedCalls", "closeRate"],
  warm: [...ANY_CHANNEL, "referralsPerMonth", "repeatPurchaseRate", "closeRate"],
};

const PATTERNS: [Channel, RegExp][] = [
  ["paidSocial", /\bmeta\b|facebook|\bfb\b|instagram ads?|tiktok ads?|paid social|social ads?/i],
  ["search", /google|search|\bseo\b|maps|yelp|\blsa\b|local services|bing|angi|thumbtack|nextdoor/i],
  ["content", /content|organic|youtube|tiktok(?! ads?)|instagram(?! ads?)|social media|posts?\b|blog|video|reels?/i],
  ["coldOutreach", /cold|door|canvass|outbound|direct mail|mailers?|flyers?|postcards?|knocking/i],
  ["warm", /referr|word of mouth|repeat|past customers?|existing customers?|email list|newsletter|network|regulars/i],
];

/** The channels named in free text such as the profile's "channels" field or an owner's answer. */
export function channelsInText(text: string): Channel[] {
  return PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([channel]) => channel);
}
