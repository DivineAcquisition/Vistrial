import "server-only";

import type { ForsightDataset, ForsightRecord } from "@/lib/forsight/types";

/**
 * A short hold on what a workspace's base just returned, so opening three
 * Forsight pages in a row is three renders and not twelve Airtable calls.
 *
 * This is a cache, not storage. Nothing here is written to our database,
 * nothing survives a restart, and nothing is read after it expires. Airtable
 * stays the only copy of this data.
 *
 * The key includes the workspace and the source, so a cached read can never be
 * served to a different tenant, and repointing a workspace at another base
 * cannot serve the old one.
 */

const TTL_MS = 3 * 60 * 1000;

type Entry = { records: ForsightRecord[]; fetchedAt: number };

const store = new Map<string, Entry>();

function keyFor(args: { orgId: string; sourceId: string; dataset: ForsightDataset }): string {
  return `${args.orgId}::${args.sourceId}::${args.dataset}`;
}

export type CachedRead = { records: ForsightRecord[]; fetchedAt: Date; fromCache: boolean };

export async function readCached(
  args: { orgId: string; sourceId: string; dataset: ForsightDataset },
  load: () => Promise<ForsightRecord[]>,
  now: () => number = Date.now
): Promise<CachedRead> {
  const key = keyFor(args);
  const at = now();
  const hit = store.get(key);

  if (hit && at - hit.fetchedAt < TTL_MS) {
    return { records: hit.records, fetchedAt: new Date(hit.fetchedAt), fromCache: true };
  }

  // A failed read throws through, and nothing is cached. A broken connection
  // must not leave a stale copy standing in for live data.
  const records = await load();
  store.set(key, { records, fetchedAt: at });
  return { records, fetchedAt: new Date(at), fromCache: false };
}

/** Test seam. Nothing in the app clears the cache. */
export function resetForsightCache(): void {
  store.clear();
}
