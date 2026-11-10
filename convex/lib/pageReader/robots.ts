/**
 * robots.txt, read the way RFC 9309 says: the group that names our agent wins over the "*" group, the
 * longest matching rule wins, and Allow wins a tie. Vistrial obeys it for every page it opens, including
 * each hop of a redirect.
 */

export type RobotsRules = {
  /** Path patterns for the group that applies to us, as written. */
  allow: string[];
  disallow: string[];
  /** Seconds the site asks crawlers to leave between requests, when it says. */
  crawlDelay?: number;
  /** The robots.txt could not be read (server error or no answer), so everything is off limits for now. */
  unavailable?: boolean;
};

export const ALLOW_ALL: RobotsRules = { allow: [], disallow: [] };
export const DISALLOW_ALL: RobotsRules = { allow: [], disallow: ["/"], unavailable: true };

/** Only this much of a robots.txt is read. Google reads 500 KiB; ours are small pages, so less is enough. */
export const MAX_ROBOTS_BYTES = 200_000;
const MAX_RULES = 400;

type Group = { agents: string[]; allow: string[]; disallow: string[]; crawlDelay?: number };

/** The rules for one agent name (lower case), from the text of a robots.txt. */
export function parseRobots(text: string, agent: string): RobotsRules {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.slice(0, MAX_ROBOTS_BYTES).split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" && value && current.allow.length < MAX_RULES) current.allow.push(value);
    else if (field === "disallow" && value && current.disallow.length < MAX_RULES) current.disallow.push(value);
    else if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
    }
  }
  // Every group naming us is merged; only when none does, the "*" groups apply.
  const named = groups.filter((group) => group.agents.some((name) => name !== "*" && name !== "" && agent.includes(name)));
  const chosen = named.length ? named : groups.filter((group) => group.agents.includes("*"));
  const rules: RobotsRules = { allow: [], disallow: [] };
  for (const group of chosen) {
    rules.allow.push(...group.allow);
    rules.disallow.push(...group.disallow);
    if (group.crawlDelay !== undefined) rules.crawlDelay = Math.max(rules.crawlDelay ?? 0, group.crawlDelay);
  }
  return rules;
}

/** How much of the pattern is literal, the measure of "longest match". -1 when the pattern does not match. */
function matchLength(pattern: string, path: string): number {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const pieces = body.split("*");
  let at = 0;
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    if (i === 0) {
      if (!path.startsWith(piece)) return -1;
      at = piece.length;
      continue;
    }
    const last = i === pieces.length - 1;
    const found = last && anchored ? (path.endsWith(piece) && path.length - piece.length >= at ? path.length - piece.length : -1) : path.indexOf(piece, at);
    if (found < 0) return -1;
    at = found + piece.length;
  }
  if (anchored && at !== path.length) return -1;
  return pattern.length;
}

function normalise(text: string) {
  // Percent-encoding is compared in one case, so "/a%2fb" and "/a%2Fb" are the same rule.
  return text.replace(/%[0-9a-fA-F]{2}/g, (match) => match.toUpperCase());
}

/** Whether the rules let us open this path (with its query string). */
export function robotsAllows(rules: RobotsRules, pathAndQuery: string): boolean {
  const path = normalise(pathAndQuery || "/");
  // robots.txt itself is always readable.
  if (path === "/robots.txt") return true;
  let allow = -1;
  let disallow = -1;
  for (const pattern of rules.allow) allow = Math.max(allow, matchLength(normalise(pattern), path));
  for (const pattern of rules.disallow) disallow = Math.max(disallow, matchLength(normalise(pattern), path));
  return disallow < 0 || allow >= disallow;
}

/**
 * What a robots.txt response means. Found: its rules. Not there (4xx): nothing is disallowed. A server error
 * or no answer: the site could not tell us, so we stay out until it can (RFC 9309, 2.3.1.4).
 */
export function rulesFromResponse(status: number, body: string, agent: string): RobotsRules {
  if (status >= 200 && status < 300) return parseRobots(body, agent);
  if (status >= 400 && status < 500) return ALLOW_ALL;
  return DISALLOW_ALL;
}
