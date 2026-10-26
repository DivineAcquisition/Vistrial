/** Patterns need at least this many saved excerpts. Below it, the report says so. */
export const MIN_PATTERN_SAMPLE = 3;

export const MAX_EXCERPT = 180;

export const LIBRARY_ACCEPTANCE = "I accept the risk of collecting public ad library pages.";

export type SwipeExcerpt = { excerpt: string; sourceName: string };

export type BusinessFacts = {
  offer: string;
  price: string;
  audience: string;
  voice: string;
  examples: string;
  pastAds: string;
  competitors: string;
};

export type ResearchInput = {
  facts: BusinessFacts;
  swipe: SwipeExcerpt[];
  ownResultsConnected: boolean;
  libraryAccepted: boolean;
};

const BANNED = /\b(earned|converted|conversion rate|roas)\b/i;

export function clipExcerpt(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= MAX_EXCERPT) return text;
  return `${text.slice(0, MAX_EXCERPT - 1).trimEnd()}…`;
}

export function profileReady(facts: Pick<BusinessFacts, "offer" | "audience">): boolean {
  return facts.offer.trim().length > 0 && facts.audience.trim().length > 0;
}

function assertOriginal(body: string) {
  if (BANNED.test(body)) {
    throw new Error("A report cannot claim a public ad earned or converted a number.");
  }
}

export function buildResearchReport(input: ResearchInput): { title: string; body: string } {
  const lines = [
    "Ad research report",
    "",
    "Proxies only. Public pages do not show an ad's results. This report does not attach a result number to a public ad.",
    `Offer: ${input.facts.offer.trim() || "Not set."}`,
    `Price: ${input.facts.price.trim() || "Not set."}`,
    `Audience: ${input.facts.audience.trim() || "Not set."}`,
    "",
    input.ownResultsConnected
      ? "The customer's own ad results are connected. Performance numbers below would come only from that account."
      : "The customer's own ad results are not connected. No performance number is available.",
    input.libraryAccepted
      ? "Public ad library collection is allowed. No live collector ran. Nothing was copied from a library page."
      : "Public ad library collection is off until an Owner accepts the risk in writing.",
    "",
  ];
  if (input.swipe.length < MIN_PATTERN_SAMPLE) {
    lines.push("Not enough data.");
  } else {
    lines.push(
      `${input.swipe.length} saved excerpts are enough to look for a pattern. The next assets must be original work, not a near-copy of any of them.`,
    );
  }
  if (input.swipe.length > 0) {
    lines.push("", "Short excerpts, with the source named:");
    for (const row of input.swipe) {
      lines.push(`- ${clipExcerpt(row.excerpt)} — ${row.sourceName.trim() || "Unnamed source"}`);
    }
  }
  const body = lines.join("\n");
  assertOriginal(body);
  return { title: "Ad research report", body };
}

export function buildCopySets(facts: BusinessFacts): { title: string; body: string } {
  if (!profileReady(facts)) throw new Error("Not enough data.");
  const voice = facts.voice.trim() || "Plain and specific.";
  const price = facts.price.trim() || "Price not set.";
  const body = [
    "Copy sets for approval. Original work from the business profile. Nothing here is a near-copy of another advertiser.",
    "",
    `Voice: ${voice}`,
    "",
    "Set A",
    facts.offer.trim(),
    `For ${facts.audience.trim()}.`,
    price,
    "",
    "Set B",
    `${facts.audience.trim()} can start with ${facts.offer.trim()}.`,
    facts.examples.trim() ? `In the voice of the examples already saved: ${facts.examples.trim()}` : "No example voice was saved.",
    "",
    "Set C",
    facts.competitors.trim()
      ? `Speak to the same market as ${facts.competitors.trim()}, without copying their ads.`
      : "No competitor was named. The lines stay about this offer.",
  ].join("\n");
  assertOriginal(body);
  return { title: "Ad copy sets", body };
}

export function buildCreativeBrief(facts: BusinessFacts): { title: string; body: string } {
  if (!profileReady(facts)) throw new Error("Not enough data.");
  const body = [
    "Creative brief for approval. This is a written brief, not a generated image or video.",
    "",
    `What the piece is for: ${facts.offer.trim()}`,
    `Who it is for: ${facts.audience.trim()}`,
    `Price to show, if any: ${facts.price.trim() || "Leave the price off."}`,
    `Voice: ${facts.voice.trim() || "Plain and specific."}`,
    "Do not recreate another advertiser's ad. Make an original scene from this offer.",
    facts.pastAds.trim() ? `What has already run: ${facts.pastAds.trim()}` : "No past ad was saved.",
  ].join("\n");
  assertOriginal(body);
  return { title: "Creative brief", body };
}

export function buildContentCalendar(facts: BusinessFacts): { title: string; body: string } {
  if (!profileReady(facts)) throw new Error("Not enough data.");
  const body = [
    "Content calendar for approval. Nothing is scheduled on an outside platform.",
    "",
    `Week 1. Introduce ${facts.offer.trim()} to ${facts.audience.trim()}.`,
    "Week 2. Show one concrete detail from the offer. Do not reuse another brand's line.",
    "Week 3. Answer one question this audience already asks.",
    `Week 4. ${facts.price.trim() ? `State the price: ${facts.price.trim()}.` : "Leave price for a later week."}`,
  ].join("\n");
  assertOriginal(body);
  return { title: "Content calendar", body };
}
