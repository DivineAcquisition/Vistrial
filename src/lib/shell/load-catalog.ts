import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { CATALOG, type CatalogAgent } from "../../../convex/catalog";

export async function loadCatalog(): Promise<CatalogAgent[]> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) return CATALOG;
  try {
    const client = new ConvexHttpClient(url);
    const live = await client.query(api.agents.list, {});
    if (live.length > 0) return live;
    await client.mutation(api.agents.ensure, {});
    const seeded = await client.query(api.agents.list, {});
    return seeded.length > 0 ? seeded : CATALOG;
  } catch {
    return CATALOG;
  }
}
