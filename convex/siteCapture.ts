/**
 * Site capture: Vistrial reads a business's website (the organization's own, or a Client's) and finds its
 * brand, offers and pages, every item with where it was found. Nothing is used until a person applies it.
 * The reading itself is in siteCaptureActions; the rules every page read obeys are the page reader's.
 * docs/rebuild/onboarding-and-first-package.md, part 1.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { OUT_OF_CREDITS, accountFor, billingOn, chargeUsage, priceFor } from "./lib/billing";
import { EMPTY_BRAND, cleanBrand, type BrandContent } from "./lib/brandKits";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere } from "./lib/clients";
import { notFound, userError } from "./lib/errors";
import { writeFact } from "./lib/facts";
import type { PageSnapshot } from "./lib/pageReader/extract";
import { parseTarget } from "./lib/pageReader/net";
import { READ_LIMITS, REASON_WORDS } from "./lib/pageReader/read";
import { canWork, requireWork } from "./lib/roles";
import { FIELD_KEYS, parseResult, type CaptureResult, type FieldKey, type PageKind } from "./lib/siteCapture/fields";
import { MORE_PAGES, purposeOf, type ChosenPage } from "./lib/siteCapture/pages";
import { normal } from "./lib/siteCapture/words";
import { contentOf } from "./brandKits";
import { platformRoute } from "./lib/modelChoice";
import { createJob, readToday } from "./pageReader";

/** The most one capture can cost us, in cents: eight pages, a logo, two stylesheets and one reading of the words. */
export const CAPTURE_MAX_CENTS = 50;

const BRAND_FIELDS: FieldKey[] = ["logo", "colors", "headingFont", "bodyFont", "tone"];

/** The site's home page, from whatever a person typed: "yourbusiness.com", a deep link, or a full address. */
export function homeOf(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const target = parseTarget(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  if (!target.ok) return null;
  return `${target.url.protocol}//${target.url.host}/`;
}

async function capturesOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, clientId: Id<"clients"> | undefined, take = 1) {
  return ctx.db
    .query("siteCaptures")
    .withIndex("by_workspace_client", (q) => q.eq("workspaceId", workspaceId).eq("clientId", clientId))
    .order("desc")
    .take(take);
}

/** The first capture of a site, the organization's own or each client's, is on Vistrial. Any later one uses credits. */
async function isFree(ctx: QueryCtx, workspaceId: Id<"workspaces">, clientId: Id<"clients"> | undefined) {
  return (await capturesOf(ctx, workspaceId, clientId)).length === 0;
}

/**
 * Starts a capture. Shared by Settings, adding a client and onboarding. The caller has checked who may ask;
 * this checks the address and, when it is not free, that the credits cover the most it can cost.
 */
export async function startCaptureFor(ctx: MutationCtx, args: { workspaceId: Id<"workspaces">; clientId?: Id<"clients">; url: string; userId: string; free: boolean }) {
  const home = homeOf(args.url);
  if (!home) throw userError("That doesn't look like a website address. Try something like yourbusiness.com.");
  if (!args.free && billingOn()) {
    const account = await accountFor(ctx, args.workspaceId);
    if (!account || account.balanceCents < priceFor(CAPTURE_MAX_CENTS)) throw userError(OUT_OF_CREDITS, "out_of_credits");
  }
  // Checked before anything is written: the capture reads up to eight pages.
  if ((await readToday(ctx, args.workspaceId)) + 1 + MORE_PAGES > READ_LIMITS.pagesPerDay) throw userError(`Up to ${READ_LIMITS.pagesPerDay} pages a day are read. Try again tomorrow.`, "limit");
  const now = Date.now();
  const captureId = await ctx.db.insert("siteCaptures", {
    workspaceId: args.workspaceId,
    ...(args.clientId ? { clientId: args.clientId } : {}),
    url: home,
    status: "reading",
    step: "home",
    pages: [{ id: "p1", url: home, kind: "home", title: "", read: false }],
    dropped: 0,
    costCents: 0,
    free: args.free,
    startedBy: args.userId,
    createdAt: now,
  });
  const job = await createJob(ctx, { workspaceId: args.workspaceId, userId: args.userId, urls: [home], captureId });
  await ctx.db.patch(captureId, { homeJobId: job.jobId });
  await ctx.scheduler.runAfter(0, internal.siteCaptureActions.run, { captureId });
  await writeAudit(ctx, { workspaceId: args.workspaceId, actorType: "user", actorId: args.userId, action: "site.capture_started", subject: captureId });
  return captureId;
}

/** Whether a capture here would be free, the most it can cost in credits otherwise, and whether this person may start one. */
export const quote = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    if (args.clientId) await clientHere(ctx, ctx.workspaceId, args.clientId);
    ctx.clients.require(args.clientId);
    const free = await isFree(ctx, ctx.workspaceId, args.clientId);
    const maxCredits = free ? 0 : priceFor(CAPTURE_MAX_CENTS);
    const account = !free && billingOn() ? await accountFor(ctx, ctx.workspaceId) : null;
    return { free, maxCredits, canAfford: free || !billingOn() || (account?.balanceCents ?? 0) >= maxCredits, canStart: canWork(ctx.member.role) };
  },
});

/** Reads a website. Owners, Admins and Members. */
export const start = workspaceMutation({
  args: { url: v.string(), clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const scope = await clientForNew(ctx, args.clientId);
    const open = (await capturesOf(ctx, ctx.workspaceId, scope.clientId)).find((row) => row.status === "reading" || row.status === "understanding");
    if (open && Date.now() - open.createdAt < 15 * 60 * 1000) throw userError("This website is being read now. Wait for it to finish.");
    const free = await isFree(ctx, ctx.workspaceId, scope.clientId);
    return startCaptureFor(ctx, { workspaceId: ctx.workspaceId, clientId: scope.clientId, url: args.url, userId: ctx.identity.subject, free });
  },
});

/**
 * Reads a client's website when it is added: scheduled by clients.create and clients.update. Nothing is
 * read when the address is not a public site, the credits do not cover it, or the day's pages are used;
 * the client's brand page then offers the read.
 */
export const startForClient = internalMutation({
  args: { clientId: v.id("clients"), userId: v.string() },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client || client.status !== "active" || !client.business?.website) return null;
    if (!homeOf(client.business.website)) return null;
    const free = await isFree(ctx, client.workspaceId, client._id);
    if (!free && billingOn()) {
      const account = await accountFor(ctx, client.workspaceId);
      if (!account || account.balanceCents < priceFor(CAPTURE_MAX_CENTS)) return null;
    }
    if ((await readToday(ctx, client.workspaceId)) + 1 + MORE_PAGES > READ_LIMITS.pagesPerDay) return null;
    await startCaptureFor(ctx, { workspaceId: client.workspaceId, clientId: client._id, url: client.business.website, userId: args.userId, free });
    return null;
  },
});

/** The progress rows a screen shows, from where the capture is. */
export function progressOf(row: Pick<Doc<"siteCaptures">, "step" | "status" | "pages">, pagesDone: number) {
  const order = ["home", "pages", "brand", "words", "done"];
  const at = row.status === "done" || row.status === "partial" ? order.length : Math.max(0, order.indexOf(row.step));
  const failed = row.status === "failed";
  // Pages to read after the home page. Booking pages on other sites (ids "b1"...) are found, not read.
  const others = row.pages.filter((page) => page.id !== "p1" && page.id.startsWith("p"));
  const readCount = at > 1 ? others.length : Math.min(pagesDone, others.length);
  const state = (index: number) => (failed && index === at ? "failed" : index < at ? "done" : index === at && !failed ? "active" : "waiting");
  return [
    { key: "home", label: "Opening your home page", state: state(0) },
    { key: "pages", label: others.length ? `Reading your pages (${readCount} of ${others.length})` : "Finding your pages", state: state(1) },
    { key: "brand", label: "Finding your logo, colours and fonts", state: state(2) },
    { key: "words", label: "Reading your offers, prices and tone of voice", state: state(3) },
  ] as const;
}

/** Pages of the second job that are no longer waiting: read, blocked or failed. */
async function pagesDone(ctx: QueryCtx, row: Doc<"siteCaptures">) {
  if (!row.pagesJobId || row.step !== "pages") return 0;
  const reads = await ctx.db
    .query("pageReads")
    .withIndex("by_workspace_job", (q) => q.eq("workspaceId", row.workspaceId).eq("jobId", row.pagesJobId!))
    .take(10);
  return reads.filter((read) => read.status !== "queued" && read.status !== "reading").length;
}

async function view(ctx: QueryCtx, row: Doc<"siteCaptures">) {
  const result = parseResult(row.result);
  return {
    id: row._id,
    clientId: row.clientId ?? null,
    url: row.url,
    status: row.status,
    step: row.step,
    progress: progressOf(row, await pagesDone(ctx, row)),
    pages: row.pages.map((page) => ({ id: page.id, url: page.url, kind: page.kind, title: page.title, read: page.read, reason: page.reason ?? null })),
    result,
    logoUrl: row.logoStorageId ? await ctx.storage.getUrl(row.logoStorageId) : null,
    reason: row.reasonCode ? (REASON_WORDS[row.reasonCode] ?? "Your site could not be read.") : null,
    free: row.free,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt ?? null,
    appliedAt: row.appliedAt ?? null,
  };
}
export type CaptureView = Awaited<ReturnType<typeof view>>;

/** The newest capture of the organization's site, or a client's. Null when there is none. */
export const latest = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    ctx.clients.require(args.clientId);
    const [row] = await capturesOf(ctx, ctx.workspaceId, args.clientId);
    return row ? view(ctx, row) : null;
  },
});

export const get = workspaceQuery({
  args: { captureId: v.id("siteCaptures") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.captureId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(row.clientId);
    return view(ctx, row);
  },
});

// ------------------------------------------------------------------------------------------------- apply

/** A person's own correction of a captured value. Anything given here is saved as theirs, not the site's. */
const edits = v.object({
  colors: v.optional(v.array(v.object({ label: v.string(), hex: v.string() }))),
  headingFont: v.optional(v.string()),
  bodyFont: v.optional(v.string()),
  tone: v.optional(v.string()),
  audience: v.optional(v.string()),
  location: v.optional(v.string()),
});

function brandFrom(current: BrandContent, result: CaptureResult, url: string, take: Set<FieldKey>, logo: { storageId: Id<"_storage"> } | null, typed: { colors?: { label: string; hex: string }[]; headingFont?: string; bodyFont?: string; tone?: string }) {
  const next: BrandContent = { ...current, website: current.website || url.replace(/\/$/, "") };
  if (take.has("colors")) next.colors = typed.colors ?? (result.colors.value ?? []).map((color) => ({ label: color.label.slice(0, 30), hex: color.hex }));
  if (take.has("headingFont")) next.headingFont = typed.headingFont ?? result.headingFont.value ?? "";
  if (take.has("bodyFont")) next.bodyFont = typed.bodyFont ?? result.bodyFont.value ?? "";
  if (take.has("tone")) {
    next.tone = typed.tone ?? result.tone.value?.text ?? "";
    if (next.examples.length === 0) next.examples = (result.tone.value?.quotes ?? []).slice(0, 3);
  }
  if (take.has("logo") && logo && !next.logos.some((row) => row.storageId === logo.storageId)) {
    next.logos = [{ storageId: logo.storageId as string, variant: "light" as const, name: "logo-from-website" }, ...next.logos].slice(0, 6);
    next.logosOwned = true;
  }
  return cleanBrand(next);
}

/**
 * Uses what a capture found: the chosen fields go into the brand kit (a new version, marked as from the
 * site), offers become offer cards, and who the business serves, where, its proof, guarantees and social
 * links become business facts (the organization) or the client's profile (a client). A logo goes in only
 * when the person confirms the business may use it. Values a person corrected are saved as theirs.
 * `confirmed` marks the facts as checked by this person (onboarding's Confirm step). Owners, Admins, Members.
 */
export async function applyCapture(
  ctx: MutationCtx,
  args: { capture: Doc<"siteCaptures">; userId: string; take: FieldKey[]; logoOwned: boolean; typed: { colors?: { label: string; hex: string }[]; headingFont?: string; bodyFont?: string; tone?: string; audience?: string; location?: string }; confirmed: boolean; offers?: number[] },
) {
  const { capture, userId } = args;
  const result = parseResult(capture.result);
  if (!result) throw userError("Nothing was found on this website yet.");
  if (args.take.includes("logo") && !args.logoOwned) throw userError("Confirm that this business owns this logo or may use it.");
  const take = new Set(args.take.filter((key) => (FIELD_KEYS as readonly string[]).includes(key)));
  const now = Date.now();
  const workspaceId = capture.workspaceId;

  // The brand kit: the organization's own, or the client's. Made when there is none.
  if (BRAND_FIELDS.some((key) => take.has(key))) {
    const kits = await ctx.db
      .query("brandKits")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(200);
    let kit = kits.find((row) => !row.archived && (capture.clientId ? row.clientId === capture.clientId : row.kind === "own"));
    const client = capture.clientId ? await ctx.db.get(capture.clientId) : null;
    const workspace = await ctx.db.get(workspaceId);
    const name = (result.name.value ?? client?.name ?? workspace?.name ?? "Your brand").slice(0, 80);
    let current: BrandContent = { ...EMPTY_BRAND, name };
    let version = 0;
    if (kit) {
      const versions = await ctx.db
        .query("brandKitVersions")
        .withIndex("by_workspace_kit", (q) => q.eq("workspaceId", workspaceId).eq("kitId", kit!._id))
        .take(200);
      const row = versions.find((item) => item.version === kit!.currentVersion);
      version = Math.max(0, ...versions.map((item) => item.version));
      if (row) current = contentOf(row);
    }
    const logo = take.has("logo") && capture.logoStorageId ? { storageId: capture.logoStorageId } : null;
    const content = brandFrom(current, result, capture.url, take, logo, args.typed);
    if (!kit) {
      const kitId = await ctx.db.insert("brandKits", {
        workspaceId,
        kind: capture.clientId ? "client" : "own",
        ...(capture.clientId ? { clientId: capture.clientId } : {}),
        name: content.name,
        currentVersion: 1,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      kit = (await ctx.db.get(kitId))!;
    }
    const typedAny = Object.keys(args.typed).some((key) => key !== "audience" && key !== "location");
    await ctx.db.insert("brandKitVersions", {
      workspaceId,
      kitId: kit._id,
      version: version + 1,
      ...content,
      logos: content.logos.map((row) => ({ ...row, storageId: row.storageId as Id<"_storage"> })),
      styleRefs: content.styleRefs.map((row) => ({ ...row, storageId: row.storageId as Id<"_storage"> })),
      note: typedAny ? "From your website, with your corrections" : "From your website",
      origin: "site",
      captureId: capture._id,
      createdBy: userId,
      createdAt: now,
    });
    await ctx.db.patch(kit._id, { currentVersion: version + 1, name: content.name, updatedAt: now });
    await writeAudit(ctx, { workspaceId, actorType: "user", actorId: userId, action: "brandKit.version", subject: kit._id, count: version + 1 });
  }

  // Offers, as the site states them. An offer already on a card of the same name is left alone.
  if (take.has("offers")) {
    const cards = await ctx.db
      .query("offerCards")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(500);
    const mine = cards.filter((card) => !card.archived && (card.clientId ?? null) === (capture.clientId ?? null));
    const offers = (result.offers.value ?? []).filter((_, index) => !args.offers || args.offers.includes(index));
    for (const offer of offers) {
      if (mine.some((card) => normal(card.name) === normal(offer.name))) continue;
      const cardId = await ctx.db.insert("offerCards", {
        workspaceId,
        ...(capture.clientId ? { clientId: capture.clientId } : {}),
        name: offer.name.slice(0, 80),
        currentVersion: 1,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("offerCardVersions", {
        workspaceId,
        cardId,
        version: 1,
        name: offer.name.slice(0, 80),
        price: offer.price,
        included: offer.included,
        guarantee: offer.guarantee,
        terms: offer.terms,
        targetCustomer: args.typed.audience ?? result.audience.value ?? "",
        origin: "site",
        captureId: capture._id,
        note: `From your website: "${offer.quote.slice(0, 160)}"`,
        createdBy: userId,
        createdAt: now,
      });
    }
  }

  const audience = take.has("audience") ? (args.typed.audience ?? result.audience.value ?? "") : "";
  const location = take.has("location") ? (args.typed.location ?? result.location.value ?? "") : "";
  if (capture.clientId) {
    // A client's profile: fill only what is blank, so nothing a person typed is replaced.
    const client = await ctx.db.get(capture.clientId);
    if (client?.business) {
      const firstOffer = take.has("offers") ? (result.offers.value?.[0]?.name ?? "") : "";
      await ctx.db.patch(client._id, {
        business: {
          ...client.business,
          website: client.business.website || capture.url,
          audience: client.business.audience || audience,
          geography: client.business.geography || location,
          offer: client.business.offer || firstOffer,
        },
        updatedAt: now,
      });
    }
  } else {
    const verifiedBy = args.confirmed ? userId : undefined;
    const fact = async (factKey: string, value: string, typedByPerson: boolean) => {
      if (!value) return;
      await writeFact(ctx, typedByPerson ? { workspaceId, factKey, value, sourceType: "owner", recordedBy: userId, verifiedBy: userId } : { workspaceId, factKey, value, sourceType: "site", sourceReference: capture._id, recordedBy: userId, verifiedBy });
    };
    if (take.has("audience")) await fact("audience", audience, args.typed.audience !== undefined);
    if (take.has("location")) await fact("researchGeography", location, args.typed.location !== undefined);
    if (take.has("guarantees")) await fact("guarantees", (result.guarantees.value ?? []).map((row) => row.quote).join(" | "), false);
    if (take.has("proof")) await fact("proof", (result.proof.value ?? []).map((row) => `${row.text}: "${row.quote}"`).join(" | "), false);
    if (take.has("social")) await fact("socialLinks", (result.social.value ?? []).map((row) => `${row.host}: ${row.url}`).join(" | "), false);
    await fact("website", capture.url, false);
  }

  await ctx.db.patch(capture._id, { appliedAt: now, appliedBy: userId });
  await writeAudit(ctx, { workspaceId, actorType: "user", actorId: userId, action: "site.capture_applied", subject: capture._id, count: take.size });
}

export const apply = workspaceMutation({
  args: {
    captureId: v.id("siteCaptures"),
    take: v.array(v.string()),
    logoOwned: v.boolean(),
    edits: v.optional(edits),
    /** Which captured offers to add, by their place in the list. Missing means all. */
    offers: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const capture = await ctx.db.get(args.captureId);
    if (!capture || capture.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(capture.clientId);
    if (capture.status !== "done" && capture.status !== "partial") throw userError("Wait for the website to finish being read.");
    await applyCapture(ctx, { capture, userId: ctx.identity.subject, take: args.take as FieldKey[], logoOwned: args.logoOwned, typed: args.edits ?? {}, confirmed: false, offers: args.offers });
    return null;
  },
});

// -------------------------------------------------------------------------------- internal: the reading

/** The model route the words step runs on: the platform's "classify" route, never a customer's choice. */
export const wordsRoute = internalQuery({
  args: {},
  handler: async (ctx) => platformRoute(ctx, "classify"),
});

export const load = internalQuery({
  args: { captureId: v.id("siteCaptures") },
  handler: async (ctx, args) => ctx.db.get(args.captureId),
});

function parseSnapshot(raw: string | undefined): PageSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PageSnapshot;
  } catch {
    return null;
  }
}

/** Each page of the capture with what reading it gave: its snapshot when it was read, its reason when not. */
export const pagesRead = internalQuery({
  args: { captureId: v.id("siteCaptures") },
  handler: async (ctx, args) => {
    const capture = await ctx.db.get(args.captureId);
    if (!capture) return [];
    const reads: Doc<"pageReads">[] = [];
    for (const jobId of [capture.homeJobId, capture.pagesJobId]) {
      if (!jobId) continue;
      reads.push(
        ...(await ctx.db
          .query("pageReads")
          .withIndex("by_workspace_job", (q) => q.eq("workspaceId", capture.workspaceId).eq("jobId", jobId))
          .take(10)),
      );
    }
    return capture.pages.map((page) => {
      const read = page.readId ? reads.find((row) => row._id === page.readId) : reads.find((row) => row.url === page.url);
      const snapshot = read && (read.status === "read" || read.status === "partial") ? parseSnapshot(read.snapshot) : null;
      return {
        ...page,
        readId: read?._id ?? null,
        state: read?.status ?? "queued",
        reasonCode: read?.reasonCode ?? null,
        finalUrl: read?.finalUrl ?? null,
        costCents: read?.costCents ?? 0,
        snapshot,
      };
    });
  },
});

export const setStep = internalMutation({
  args: { captureId: v.id("siteCaptures"), step: v.string(), status: v.optional(v.union(v.literal("reading"), v.literal("understanding"))) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.captureId);
    if (!row || row.status === "done" || row.status === "failed" || row.status === "partial") return null;
    await ctx.db.patch(row._id, { step: args.step, ...(args.status ? { status: args.status } : {}) });
    return null;
  },
});

/** After the home page: the other pages chosen to read, and booking pages found on other sites. */
export const addPages = internalMutation({
  args: { captureId: v.id("siteCaptures"), read: v.array(v.object({ url: v.string(), kind: v.string(), text: v.string() })), booking: v.array(v.object({ url: v.string(), kind: v.string(), text: v.string() })), homeTitle: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.captureId);
    if (!row || row.status !== "reading") return null;
    const toRead = args.read.slice(0, MORE_PAGES);
    const pages = [
      { ...row.pages[0], title: args.homeTitle.slice(0, 200), read: true },
      ...toRead.map((page, index) => ({ id: `p${index + 2}`, url: page.url, kind: page.kind, title: page.text.slice(0, 200), read: false })),
      // Found, not read: the booking tool's own page.
      ...args.booking.map((page, index) => ({ id: `b${index + 1}`, url: page.url, kind: "booking", title: page.text.slice(0, 200), read: false, reason: "On your booking tool's site. Recorded, not read." })),
    ];
    let pagesJobId: Id<"pageReadJobs"> | undefined;
    if (toRead.length > 0) {
      try {
        pagesJobId = (await createJob(ctx, { workspaceId: row.workspaceId, userId: row.startedBy, urls: toRead.map((page) => page.url), captureId: row._id })).jobId;
      } catch {
        // Over the day's page limit: the capture goes on with the home page alone.
        pagesJobId = undefined;
      }
    }
    await ctx.db.patch(row._id, { pages, step: pagesJobId ? "pages" : "brand", ...(pagesJobId ? { pagesJobId } : {}) });
    return pagesJobId ?? null;
  },
});

export const fail = internalMutation({
  args: { captureId: v.id("siteCaptures"), reasonCode: v.string(), pages: v.optional(v.array(v.object({ id: v.string(), read: v.boolean(), reason: v.optional(v.string()), title: v.string() }))) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.captureId);
    if (!row || row.status === "done" || row.status === "failed") return null;
    const pages = row.pages.map((page) => {
      const next = args.pages?.find((item) => item.id === page.id);
      return next ? { ...page, read: next.read, title: next.title || page.title, ...(next.reason ? { reason: next.reason } : {}) } : page;
    });
    await ctx.db.patch(row._id, { status: "failed", reasonCode: args.reasonCode.slice(0, 40), pages, finishedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "system", actorId: "site-capture", action: "site.capture_failed", subject: row._id });
    return null;
  },
});

/** Saves what was found and charges the capture once, unless it is on Vistrial. */
export const save = internalMutation({
  args: {
    captureId: v.id("siteCaptures"),
    result: v.string(),
    pages: v.array(v.object({ id: v.string(), kind: v.string(), read: v.boolean(), reason: v.optional(v.string()), title: v.string(), readId: v.optional(v.id("pageReads")) })),
    logoStorageId: v.optional(v.id("_storage")),
    dropped: v.number(),
    modelCents: v.number(),
    pageCents: v.number(),
    partial: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.captureId);
    if (!row || row.status === "done" || row.status === "failed" || row.status === "partial") {
      if (args.logoStorageId) await ctx.storage.delete(args.logoStorageId);
      return null;
    }
    const pages = row.pages.map((page) => {
      const next = args.pages.find((item) => item.id === page.id);
      if (!next) return page;
      const { reason, readId, ...rest } = next;
      return { ...page, ...rest, ...(reason ? { reason } : {}), ...(readId ? { readId } : {}) };
    });
    const costCents = Math.round((args.modelCents + args.pageCents) * 1000) / 1000;
    await ctx.db.patch(row._id, {
      status: args.partial ? "partial" : "done",
      step: "done",
      result: args.result,
      pages,
      dropped: args.dropped,
      costCents,
      ...(args.logoStorageId ? { logoStorageId: args.logoStorageId } : {}),
      finishedAt: Date.now(),
    });
    if (!row.free) await chargeUsage(ctx, { workspaceId: row.workspaceId, costCents, source: "page", ref: row._id });
    await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "system", actorId: "site-capture", action: "site.capture_done", subject: row._id, count: pages.filter((page) => page.read).length });
    return null;
  },
});

/** A page's purpose once it is read: what is on it, else how the home page linked to it. */
export function finalKind(snapshot: PageSnapshot | null, url: string, linked: string): PageKind {
  const kind = linked as PageKind;
  return snapshot && kind !== "home" ? purposeOf(snapshot, url, kind) : kind;
}

export type { ChosenPage };
