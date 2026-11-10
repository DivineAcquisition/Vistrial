"use node";
/**
 * Reads the pages of a job, one page per call, then schedules itself for the next. Runs in Node because the
 * address check needs the DNS resolver and a raw socket (see lib/pageReader/nodeFetch): Convex's default
 * runtime has neither. One page per call keeps every call far inside the action time limit however slow a
 * site is.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { nodeFetch } from "./lib/pageReader/nodeFetch";
import { readPage, type PageResult, type RawResponse, type ReadEnv } from "./lib/pageReader/read";
import { rendererFromEnv } from "./lib/pageReader/renderers";
import type { RobotsRules } from "./lib/pageReader/robots";

/** Tests script the network: a function from URL to a response, or a thrown FetchFailure. Never set in production. */
export type ScriptedPages = (url: URL) => RawResponse | Promise<RawResponse>;
type Globals = { __vistrialScriptedPages?: ScriptedPages; __vistrialScriptedRenderer?: ReadEnv["renderer"] };

export function liveReadEnv(ctx: ActionCtx): ReadEnv {
  const scripted = (globalThis as Globals).__vistrialScriptedPages;
  const scriptedRenderer = (globalThis as Globals).__vistrialScriptedRenderer;
  return {
    fetch: scripted ? async (url) => scripted(url) : (url, options) => nodeFetch(url, options),
    robots: (site) => ctx.runQuery(internal.pageReader.siteRobots, { site }),
    saveRobots: async (site, rules: RobotsRules) => {
      await ctx.runMutation(internal.pageReader.saveRobots, { site, rules: JSON.stringify(rules) });
    },
    claim: (site, gapMs, maxWaitMs) => ctx.runMutation(internal.pageReader.claimSite, { site, gapMs, maxWaitMs }),
    // Scripted tests do not wait out the rate limit; the slot arithmetic is tested on its own.
    sleep: (ms) => (scripted ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))),
    now: () => Date.now(),
    renderer: scriptedRenderer !== undefined ? scriptedRenderer : rendererFromEnv(),
  };
}

async function store(ctx: ActionCtx, image: Uint8Array | undefined): Promise<Id<"_storage"> | undefined> {
  if (!image?.byteLength) return undefined;
  const jpeg = image[0] === 0xff && image[1] === 0xd8;
  return ctx.storage.store(new Blob([image as BlobPart], { type: jpeg ? "image/jpeg" : "image/png" }));
}

/** Reads one page and saves it. Shared by jobs and by agent runs. */
export async function readAndSave(ctx: ActionCtx, readId: Id<"pageReads">, url: string): Promise<PageResult["state"]> {
  let result: PageResult;
  try {
    result = await readPage(url, liveReadEnv(ctx));
  } catch {
    // readPage does not throw; this is for a fault in the code around it. The page is closed, never left open.
    result = { state: "failed", reasonCode: "connect_failed", finalUrl: null, httpStatus: null, driver: "fetch", snapshot: null, htmlBytes: 0, wireBytes: 0, redirects: 0, durationMs: 0, screenshots: {} };
  }
  const desktopShot = await store(ctx, result.screenshots.desktop);
  const phoneShot = await store(ctx, result.screenshots.phone);
  await ctx.runMutation(internal.pageReader.savePage, {
    readId,
    state: result.state,
    reasonCode: result.reasonCode,
    ...(result.finalUrl ? { finalUrl: result.finalUrl.slice(0, 1000) } : {}),
    ...(result.httpStatus !== null ? { httpStatus: result.httpStatus } : {}),
    driver: result.driver,
    ...(result.snapshot ? { snapshot: JSON.stringify(result.snapshot), title: result.snapshot.title } : {}),
    htmlBytes: result.htmlBytes,
    wireBytes: result.wireBytes,
    redirects: result.redirects,
    durationMs: result.durationMs,
    ...(desktopShot ? { desktopShot } : {}),
    ...(phoneShot ? { phoneShot } : {}),
  });
  return result.state;
}

export const next = internalAction({
  args: { jobId: v.id("pageReadJobs") },
  handler: async (ctx, args): Promise<null> => {
    const claimed = await ctx.runMutation(internal.pageReader.claimNext, { jobId: args.jobId });
    if (!claimed) return null;
    await readAndSave(ctx, claimed.readId, claimed.url);
    await ctx.scheduler.runAfter(0, internal.pageReadActions.next, { jobId: args.jobId });
    return null;
  },
});
