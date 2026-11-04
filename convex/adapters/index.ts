import type { CollectTool } from "../lib/registry";
import { metaAdLibraryAdapter } from "./metaAdLibrary";
import { instagramAdapter, tiktokAdapter } from "./oembed";
import { result, type CollectEnv, type CollectInput, type CollectResult, type SourceAdapter } from "./types";
import { webAdapter } from "./web";
import { youtubeAdapter } from "./youtube";

export const ADAPTERS: Record<CollectTool, SourceAdapter> = {
  "source.web": webAdapter,
  "source.youtube": youtubeAdapter,
  "source.tiktok": tiktokAdapter,
  "source.instagram": instagramAdapter,
  "source.metaAdLibrary": metaAdLibraryAdapter,
};

/** Runs one adapter. It never throws: anything unexpected reads as unavailable, with no detail kept. */
export async function runAdapter(tool: CollectTool, input: CollectInput, env: CollectEnv): Promise<CollectResult> {
  const adapter = ADAPTERS[tool];
  try {
    return await adapter.collect(input, env);
  } catch {
    return result(adapter.platform, "unavailable", "adapter_error");
  }
}

/** The real network and settings, for the step action. */
export function liveEnv(): CollectEnv {
  return {
    fetch: (url, init) => fetch(url, { headers: init?.headers, signal: AbortSignal.timeout(15_000) }),
    setting: (name) => process.env[name] || undefined,
    now: () => Date.now(),
  };
}
