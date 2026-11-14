"use node";
/**
 * Reads a business's website for a site capture, one piece per call so every call stays far inside the
 * action time limit: the home page, then each chosen page, then the brand files and one reading of the
 * words. Every page and file is fetched under the page reader's rules (public addresses, robots.txt, the
 * per-site gap, VistrialBot). Page content is untrusted: it reaches the model only wrapped as such.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { REASON_WORDS } from "./lib/pageReader/read";
import { assemble, structuredOf, type ReadPage } from "./lib/siteCapture/assemble";
import { fetchImage, fetchStylesheet, ASSET_LIMITS } from "./lib/siteCapture/assets";
import { pickLogo } from "./lib/siteCapture/brand";
import type { PageKind } from "./lib/siteCapture/fields";
import { bareHost, choosePages } from "./lib/siteCapture/pages";
import { WORDS_MAX_CENTS, WORDS_SCHEMA, WORDS_SYSTEM, verifyWords, wordsInput, type WordsResult } from "./lib/siteCapture/words";
import { completeWithTools } from "./lib/toolRouter";
import { liveReadEnv, readAndSave } from "./pageReadActions";
import { finalKind } from "./siteCapture";

/** Reads the next queued page of a job. False when the job has none left (it is then finished and costed). */
async function readNext(ctx: ActionCtx, jobId: Id<"pageReadJobs">) {
  const claimed = await ctx.runMutation(internal.pageReader.claimNext, { jobId });
  if (!claimed) return false;
  await readAndSave(ctx, claimed.readId, claimed.url);
  return true;
}

export const run = internalAction({
  args: { captureId: v.id("siteCaptures") },
  handler: async (ctx, args): Promise<null> => {
    const capture = await ctx.runQuery(internal.siteCapture.load, { captureId: args.captureId });
    if (!capture || capture.status === "done" || capture.status === "failed" || capture.status === "partial") return null;
    const again = () => ctx.scheduler.runAfter(0, internal.siteCaptureActions.run, { captureId: args.captureId });

    if (capture.step === "home") {
      if (capture.homeJobId && (await readNext(ctx, capture.homeJobId))) {
        // Close the job (it has one page), so its cost is settled.
        await ctx.runMutation(internal.pageReader.claimNext, { jobId: capture.homeJobId });
      }
      const [home] = await ctx.runQuery(internal.siteCapture.pagesRead, { captureId: args.captureId });
      if (!home?.snapshot) {
        const reasonCode = home?.reasonCode ?? "connect_failed";
        await ctx.runMutation(internal.siteCapture.fail, { captureId: args.captureId, reasonCode, pages: [{ id: "p1", read: false, reason: REASON_WORDS[reasonCode] ?? "Your home page could not be read.", title: "" }] });
        return null;
      }
      const chosen = choosePages(home.snapshot, home.finalUrl ?? home.url);
      await ctx.runMutation(internal.siteCapture.addPages, {
        captureId: args.captureId,
        read: chosen.read.map((row) => ({ url: row.url, kind: row.kind, text: row.text })),
        booking: chosen.booking.map((row) => ({ url: row.url, kind: row.kind, text: row.text })),
        homeTitle: home.snapshot.title,
      });
      await again();
      return null;
    }

    if (capture.step === "pages") {
      if (capture.pagesJobId && (await readNext(ctx, capture.pagesJobId))) {
        await again();
        return null;
      }
      await ctx.runMutation(internal.siteCapture.setStep, { captureId: args.captureId, step: "brand", status: "understanding" });
      await again();
      return null;
    }

    if (capture.step === "brand" || capture.step === "words") {
      await understand(ctx, args.captureId);
      return null;
    }
    return null;
  },
});

/** The brand files, the words, and the result, in one call (a few requests and one model call). */
async function understand(ctx: ActionCtx, captureId: Id<"siteCaptures">) {
  await ctx.runMutation(internal.siteCapture.setStep, { captureId, step: "brand", status: "understanding" });
  const rows = await ctx.runQuery(internal.siteCapture.pagesRead, { captureId });
  const pages: ReadPage[] = rows.map((row) => ({
    id: row.id,
    url: row.finalUrl ?? row.url,
    kind: (row.id.startsWith("b") ? "booking" : finalKind(row.snapshot, row.url, row.kind)) as PageKind,
    title: row.snapshot?.title || row.title,
    read: Boolean(row.snapshot),
    reason: row.snapshot ? null : row.id.startsWith("b") ? (row.reason ?? null) : row.reasonCode ? (REASON_WORDS[row.reasonCode] ?? "This page could not be read.") : null,
    snapshot: row.snapshot,
  }));
  const home = pages[0];
  const env = liveReadEnv(ctx);
  const site = bareHost(new URL(home.url).hostname);

  // The site's own stylesheets: the first two on its own domain (or a subdomain of it).
  const stylesheets: { url: string; css: string; pageId: string | null }[] = [];
  for (const href of home.snapshot?.brand?.stylesheets ?? []) {
    if (stylesheets.length >= ASSET_LIMITS.stylesheets) break;
    let host = "";
    try {
      host = bareHost(new URL(href).hostname);
    } catch {
      continue;
    }
    if (host !== site && !host.endsWith(`.${site}`)) continue;
    const sheet = await fetchStylesheet(href, env);
    if (sheet) stylesheets.push({ url: sheet.url, css: new TextDecoder("utf-8").decode(sheet.body), pageId: home.id });
  }

  // The logo: found in code, downloaded under the same rules, kept as a file a person must still confirm.
  let logo: { url: string; storageId: string | null; from: string; how: "structured data" | "image" | "meta tag" } | null = null;
  let logoStorageId: Id<"_storage"> | undefined;
  if (home.snapshot?.brand) {
    const pick = pickLogo(home.snapshot.brand, structuredOf(pages));
    if (pick) {
      const file = await fetchImage(pick.url, env);
      if (file) {
        logoStorageId = await ctx.storage.store(new Blob([file.body as BlobPart], { type: file.contentType }));
        logo = { url: file.url, storageId: logoStorageId, from: pick.from, how: pick.how };
      }
    }
  }

  await ctx.runMutation(internal.siteCapture.setStep, { captureId, step: "words" });
  let words: WordsResult | null = null;
  let modelCents = 0;
  const readable = pages.filter((page) => page.read && page.snapshot).map((page) => ({ id: page.id, url: page.url, kind: page.kind, snapshot: page.snapshot! }));
  const route = await ctx.runQuery(internal.siteCapture.wordsRoute, {});
  if (route && readable.length > 0) {
    try {
      const reply = await completeWithTools(route, "classify", { system: WORDS_SYSTEM, input: wordsInput(readable), outputSchema: WORDS_SCHEMA as unknown as Record<string, unknown>, maxTurns: 2 });
      modelCents = reply.costCents;
      words = verifyWords(reply.output, readable);
      if (modelCents > WORDS_MAX_CENTS) console.warn(`site capture: the words step cost ${modelCents} cents, over its ${WORDS_MAX_CENTS}`);
    } catch (cause) {
      // The brand found in code stands; the words are shown as not read.
      console.error("site capture: reading the words failed", cause instanceof Error ? cause.name : "unknown");
    }
  }

  const result = assemble({ pages, stylesheets, logo, words });
  const pageCents = rows.reduce((sum, row) => sum + row.costCents, 0);
  await ctx.runMutation(internal.siteCapture.save, {
    captureId,
    result: JSON.stringify(result),
    pages: pages.map((page) => ({ id: page.id, kind: page.kind, read: page.read, title: page.title.slice(0, 200), ...(page.reason ? { reason: page.reason } : {}), ...(rows.find((row) => row.id === page.id)?.readId ? { readId: rows.find((row) => row.id === page.id)!.readId! } : {}) })),
    ...(logoStorageId ? { logoStorageId } : {}),
    dropped: result.dropped,
    modelCents,
    pageCents,
    partial: words === null,
  });
}
