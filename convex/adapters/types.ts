import type { CollectResult, FoundSource, Platform } from "../lib/researchShapes";

/** The project scope an adapter works from. Text a person typed; never model output. */
export type CollectScope = {
  market: string;
  geography: string;
  competitors: { name: string; url?: string }[];
  platforms: Platform[];
  suppliedUrls: string[];
};

/** Everything an adapter may read. The network and the settings are passed in, so tests use fixtures. */
export type CollectInput = {
  scope: CollectScope;
  /** The web tools' results from this run's model steps, as saved (`{ sources, citations }` JSON), newest first. */
  webResults: string[];
  /** Links this project already holds, per platform, so a later adapter can check what an earlier one found. */
  knownUrls: Partial<Record<Platform, string[]>>;
};

export type CollectEnv = {
  fetch: (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  /** Settings by name. Keys never leave the adapter: not in a result, a reason or a saved record. */
  setting: (name: string) => string | undefined;
  now: () => number;
};

/**
 * A source adapter. It never logs in, keeps cookies, solves challenges, rotates proxies or retries around
 * a block. When it cannot do something it says so in `state`, `reasonCode` and `limitation`.
 */
export type SourceAdapter = {
  platform: Platform;
  collect(input: CollectInput, env: CollectEnv): Promise<CollectResult>;
};

export type { CollectResult, FoundSource };

/** At most this many sources from one adapter in one run. */
export const MAX_SOURCES_PER_ADAPTER = 40;

/** At most this many links checked one by one (oEmbed) in one run. */
export const MAX_LINKS_CHECKED = 15;

export function result(
  platform: Platform,
  state: CollectResult["state"],
  reasonCode: string,
  sources: FoundSource[] = [],
  limitation?: string,
): CollectResult {
  return { platform, state, reasonCode, sources: sources.slice(0, MAX_SOURCES_PER_ADAPTER), ...(limitation ? { limitation } : {}) };
}
