/**
 * The research intake as a conversation: a fixed checklist held in code, filled from business memory first,
 * then from what the person says. Claude phrases the questions; code decides which slot is still missing,
 * how many questions are left, and when the plan is ready. No model output fills a slot without code
 * checking it.
 */

export const INTAKE_CAP_CENTS = 25;
export const MAX_QUESTIONS = 5;
/** Finding competitors uses a web search; it runs only when this much of the cap is left. */
export const DISCOVERY_RESERVE_CENTS = 12;

export const ALL_PLATFORMS = ["web", "youtube", "tiktok", "instagram", "metaAdLibrary"] as const;
export type IntakePlatform = (typeof ALL_PLATFORMS)[number];

/** The checklist, in the order Vistrial asks. "Where to look" is filled by code, never asked. */
export const ASKED_SLOTS = ["objective", "market", "geography", "competitors"] as const;
export type AskedSlot = (typeof ASKED_SLOTS)[number];

export type Origin = "memory" | "you" | "found" | "assumed";

export type Competitor = { name: string; url?: string; origin: Origin };

export type Slots = {
  objective: string;
  market: string;
  geography: string;
  competitors: Competitor[];
  /** The person said they do not know any; Vistrial finds them. */
  competitorsUnknown: boolean;
  platforms: IntakePlatform[];
  links: string[];
  origins: Partial<Record<AskedSlot | "platforms", Origin>>;
};

export function emptySlots(): Slots {
  return { objective: "", market: "", geography: "", competitors: [], competitorsUnknown: false, platforms: [...ALL_PLATFORMS], links: [], origins: { platforms: "assumed" } };
}

/** Business memory fills what it can, marked as from memory. */
export function prefill(
  slots: Slots,
  memory: { offer?: string; geography?: string; competitors?: { name: string; url?: string }[]; market?: string; area?: string; audienceChannels?: string },
): Slots {
  const next = { ...slots, origins: { ...slots.origins } };
  const market = (memory.market || memory.offer || "").trim();
  const area = (memory.area || memory.geography || "").trim();
  if (!next.market && market) {
    next.market = market;
    next.origins.market = "memory";
  }
  if (!next.geography && area) {
    next.geography = area;
    next.origins.geography = "memory";
  }
  if (next.competitors.length === 0 && memory.competitors?.length) {
    next.competitors = memory.competitors.filter((row) => row.name.trim()).slice(0, 8).map((row) => ({ name: row.name.trim(), ...(row.url ? { url: row.url } : {}), origin: "memory" as const }));
    if (next.competitors.length) next.origins.competitors = "memory";
  }
  const learned = parsePlatforms(memory.audienceChannels ?? "");
  if (learned.length) {
    next.platforms = learned;
    next.origins.platforms = "memory";
  }
  return next;
}

export function parsePlatforms(text: string): IntakePlatform[] {
  const words = text.toLowerCase();
  return ALL_PLATFORMS.filter((row) => words.includes(row.toLowerCase()) || (row === "metaAdLibrary" && /meta ad|ad library/.test(words)));
}

/** The first checklist item still empty, or null when the plan can be shown. */
export function nextMissing(slots: Slots): AskedSlot | null {
  if (!slots.objective.trim()) return "objective";
  if (!slots.market.trim()) return "market";
  if (!slots.geography.trim()) return "geography";
  if (slots.competitors.length === 0 && !slots.competitorsUnknown) return "competitors";
  return null;
}

/** Clean text from a person or a model: one line, trimmed, bounded. */
export function clean(value: unknown, max = 200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function cleanUrl(value: unknown) {
  const text = clean(value, 300);
  if (!text) return undefined;
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export type ModelUpdate = {
  objective?: string;
  market?: string;
  geography?: string;
  competitors?: { name?: string; url?: string }[];
  competitorsUnknown?: boolean;
  links?: string[];
};

/**
 * Applies what Claude read from the person's latest message. It may fill an empty slot or replace one the
 * person stated before; it never overwrites memory without the person saying something new about it.
 */
export function applyUpdate(slots: Slots, update: ModelUpdate): { slots: Slots; changed: AskedSlot[] } {
  const next: Slots = { ...slots, competitors: [...slots.competitors], links: [...slots.links], origins: { ...slots.origins } };
  const changed: AskedSlot[] = [];
  for (const key of ["objective", "market", "geography"] as const) {
    const value = clean(update[key], key === "objective" ? 400 : 120);
    if (value && value !== next[key]) {
      next[key] = value;
      next.origins[key] = "you";
      changed.push(key);
    }
  }
  const named = (update.competitors ?? [])
    .map((row) => ({ name: clean(row.name, 80), url: cleanUrl(row.url) }))
    .filter((row) => row.name);
  if (named.length) {
    const seen = new Set(next.competitors.map((row) => row.name.toLowerCase()));
    for (const row of named) {
      if (seen.has(row.name.toLowerCase())) continue;
      seen.add(row.name.toLowerCase());
      next.competitors.push({ name: row.name, ...(row.url ? { url: row.url } : {}), origin: "you" });
    }
    next.competitors = next.competitors.slice(0, 8);
    next.competitorsUnknown = false;
    next.origins.competitors = "you";
    changed.push("competitors");
  } else if (update.competitorsUnknown && next.competitors.length === 0) {
    next.competitorsUnknown = true;
  }
  for (const link of update.links ?? []) {
    const url = cleanUrl(link);
    if (url && !next.links.includes(url) && next.links.length < 10) next.links.push(url);
  }
  return { slots: next, changed };
}

/** The question for a slot when Claude is not available: the guided spine. */
export const FALLBACK_QUESTIONS: Record<AskedSlot, { text: string; chips: string[] }> = {
  objective: { text: "What do you want to find out?", chips: ["What competitors lead with", "How competitors price", "What their ads promise"] },
  market: { text: "What do you sell? A few words is enough.", chips: [] },
  geography: { text: "Which area should I research? A city, region or country.", chips: [] },
  competitors: { text: "Which competitors should I include? Names or websites. If you're not sure, I'll find your main local ones.", chips: ["I'm not sure, find them"] },
};

/** Answers that mean "I don't know any competitors", for the guided spine. */
export function saysUnknown(text: string) {
  return /\b(not sure|no idea|don'?t know|find (them|some)|you find|none|skip)\b/i.test(text);
}

/** Which answers are worth offering to remember, and under which business-memory key. */
export const REMEMBER_KEYS: Partial<Record<AskedSlot, { factKey: string; label: string }>> = {
  market: { factKey: "researchMarket", label: "what you sell" },
  geography: { factKey: "researchGeography", label: "your area" },
};

export const PLATFORM_WORDS: Record<IntakePlatform, string> = {
  web: "Web",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  metaAdLibrary: "Meta Ad Library",
};
