/**
 * Checks one source adapter against the real provider, without a run, a model call or any saved data.
 * Internal only: run it from the Convex dashboard (Functions → sourceCheck → probe) after adding or
 * changing a key. Keys stay in the adapter; the result holds only states, reason codes and titles.
 */

import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { liveEnv, runAdapter } from "./adapters";
import type { CollectTool } from "./lib/registry";

const TOOLS: Record<string, CollectTool> = {
  web: "source.web",
  youtube: "source.youtube",
  tiktok: "source.tiktok",
  instagram: "source.instagram",
  metaAdLibrary: "source.metaAdLibrary",
};

export const probe = internalAction({
  args: {
    platform: v.string(),
    market: v.string(),
    geography: v.string(),
    competitors: v.optional(v.array(v.string())),
    urls: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    const tool = TOOLS[args.platform];
    if (!tool) throw new Error(`Pick one of: ${Object.keys(TOOLS).join(", ")}.`);
    const result = await runAdapter(
      tool,
      {
        scope: {
          market: args.market,
          geography: args.geography,
          competitors: (args.competitors ?? []).map((name) => ({ name })),
          platforms: [asPlatform(args.platform)],
          suppliedUrls: args.urls ?? [],
        },
        webResults: [],
        knownUrls: {},
      },
      liveEnv(),
    );
    return {
      platform: result.platform,
      state: result.state,
      reasonCode: result.reasonCode,
      limitation: result.limitation ?? null,
      found: result.sources.length,
      examples: result.sources.slice(0, 5).map((row) => ({ title: row.title, publisher: row.publisher ?? null, url: row.url, availability: row.availability })),
    };
  },
});

function asPlatform(name: string) {
  return name as "web" | "youtube" | "tiktok" | "instagram" | "metaAdLibrary";
}

/**
 * Asks Meta why a token is or is not accepted, for the Ad Library. Takes the setting's name, never the token.
 * Returns only Meta's error code, subcode, type and message, which do not contain the token.
 */
export const metaToken = internalAction({
  args: { setting: v.union(v.literal("META_AD_LIBRARY_TOKEN"), v.literal("META_AD_ACCESS_TOKEN")) },
  handler: async (_ctx, args) => {
    const token = process.env[args.setting];
    if (!token) return { setting: args.setting, present: false };
    const version = process.env.META_GRAPH_VERSION || "v25.0";
    const check = async (path: string) => {
      const response = await fetch(`https://graph.facebook.com/${version}/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      const body = (await response.json().catch(() => null)) as { error?: { code?: number; error_subcode?: number; type?: string; message?: string }; data?: unknown[] } | null;
      return response.ok
        ? { ok: true, rows: Array.isArray(body?.data) ? body.data.length : null }
        : { ok: false, code: body?.error?.code ?? null, subcode: body?.error?.error_subcode ?? null, type: body?.error?.type ?? null, message: body?.error?.message ?? null };
    };
    const params = new URLSearchParams({ search_terms: "cleaning", ad_reached_countries: JSON.stringify(["GB"]), ad_type: "ALL", fields: "id,page_name", limit: "3" });
    return { setting: args.setting, present: true, me: await check("me?fields=id"), adsArchive: await check(`ads_archive?${params}`) };
  },
});
