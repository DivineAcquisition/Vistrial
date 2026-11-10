/**
 * The agent chat's router, in code: which skill a first message is for. Pure, so the server decides and a
 * test can read every case. It never guesses: when no skill clearly leads, it returns null and the chat asks
 * which of the three the person wants.
 */

export const CHAT_ROUTES = ["market-intelligence", "offer-intelligence", "growth-diagnostics"] as const;
export type ChatRoute = (typeof CHAT_ROUTES)[number];

/** How an undecided conversation is stored until the person chooses. */
export const UNDECIDED = "undecided";

export function isChatRoute(value: unknown): value is ChatRoute {
  return (CHAT_ROUTES as readonly unknown[]).includes(value);
}

/** The three choices the chat offers when it cannot tell, in the order it shows them. */
export const ROUTE_CHOICES: { skill: ChatRoute; chip: string; name: string; does: string }[] = [
  { skill: "market-intelligence", chip: "Research my market", name: "Market Intelligence", does: "researches your market and competitors, with every source" },
  { skill: "offer-intelligence", chip: "Work on my offer", name: "Offer Intelligence", does: "sets your offer beside competitors' and suggests changes to test" },
  { skill: "growth-diagnostics", chip: "Find why I'm not growing", name: "Growth Diagnostics", does: "finds where growth stalls in your own data and writes a 90-day roadmap" },
];

export const ROUTE_QUESTION = "I can take this three ways. Which do you want?";

type Signal = { pattern: RegExp; weight: number };

/** Strong signals name the job outright; weak ones only lean. */
const SIGNALS: Record<ChatRoute, Signal[]> = {
  "growth-diagnostics": [
    { pattern: /\b(not|n['’]?t|stopped|stop) (growing|scaling)\b/, weight: 3 },
    { pattern: /\bwhy\b.{0,60}\b(grow|growth|growing|stall|stalled|stuck|flat|plateau|slow|slowed|dropp?ed|down)\b/, weight: 3 },
    { pattern: /\b(stall(s|ed|ing)?|plateau(ed|ing)?|bottleneck|diagnos(e|is|tic|tics))\b/, weight: 3 },
    { pattern: /\b(losing|lost) (clients|customers|accounts)\b|\bchurn/, weight: 3 },
    { pattern: /\b(roadmap|90[- ]day|cost per (lead|client|booking)|my (numbers|results|funnel|pipeline))\b/, weight: 1 },
  ],
  "offer-intelligence": [
    // The offer is the thing to work on, whatever it is set against ("analyse my offer against my research").
    { pattern: /\b(analy[sz]e|review|improve|sharpen|strengthen|refine|rewrite|rework|fix|test)\b.{0,20}\b(my|our|this|the) (offer|offers|retainer|package|pricing|guarantee)\b/, weight: 5 },
    { pattern: /\b(my|our|this|the|new) (offer|offers|retainer|package|pricing|price|guarantee)\b/, weight: 3 },
    { pattern: /\b(what|how much) (should|do|can) (i|we) charge\b/, weight: 3 },
    { pattern: /\b(offers?|pricing|price[sd]?|guarantees?|retainers?|packages?|bundle|bonus(es)?|upsell)\b/, weight: 1 },
  ],
  "market-intelligence": [
    { pattern: /\b(competitors?|competition|rivals?)\b|\b(other|competing|rival)\b[\w\s-]{0,24}\b(agencies|firms|shops|companies|businesses)\b/, weight: 3 },
    { pattern: /\b(market research|research (my|our|the)|my market|our market|the market)\b/, weight: 3 },
    { pattern: /\b(research|market|trends?|landscape|audience|who else|find out|look into|benchmark)\b/, weight: 1 },
  ],
};

export function routeScores(text: string): Record<ChatRoute, number> {
  const flat = text.toLowerCase().replace(/\s+/g, " ");
  const out = { "market-intelligence": 0, "offer-intelligence": 0, "growth-diagnostics": 0 } as Record<ChatRoute, number>;
  for (const route of CHAT_ROUTES) {
    for (const signal of SIGNALS[route]) if (signal.pattern.test(flat)) out[route] += signal.weight;
  }
  return out;
}

/** The one skill that clearly leads, or null when nothing does or two tie. */
export function routeIntent(text: string): ChatRoute | null {
  const scores = routeScores(text);
  const ranked = [...CHAT_ROUTES].sort((a, b) => scores[b] - scores[a]);
  if (scores[ranked[0]] === 0 || scores[ranked[0]] === scores[ranked[1]]) return null;
  return ranked[0];
}

/** A tapped choice names its skill exactly; a typed answer is read like a first message. */
export function routeChoice(text: string): ChatRoute | null {
  const flat = text.trim().toLowerCase();
  const tapped = ROUTE_CHOICES.find((row) => row.chip.toLowerCase() === flat || row.name.toLowerCase() === flat);
  return tapped ? tapped.skill : routeIntent(text);
}
