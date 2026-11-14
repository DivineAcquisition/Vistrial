/**
 * The page a lead opens for their proposal (Dealmaker, Proposal Architect; docs/rebuild/dealmaker.md, 0.8 and
 * 0.10 item 4). A PDF attached to an email cannot say it was opened, so the proposal is sent as a link to a page
 * that serves it; the page counts its opens, offers the PDF, and has "Accept" (a typed name, not a signature).
 *
 * - `share`: a person shares a proposal a person approved. It makes the page's link and files the email to the
 *   lead as a Comms draft of the price kind, so it waits for a person (a hard stop). Nothing is sent here.
 * - `page`, `seen` and `accept` are called by Vistrial's web server for the lead (they hold the page's secret).
 *   The page shows only what the lead should read: never the review, its labels or the team's notes.
 * - Accepting proposes marking the deal won in the CRM; won still waits for the Owner (a hard stop).
 * - `nudges`: a proposal not opened within three days gets one follow-up email drafted in code, in Comms for a person.
 * - The payment link says "Not set up yet" until Stripe is configured on this deployment.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { fileAgentDraft } from "./comms";
import { appUrl } from "./emailReminders";
import { writeAudit } from "./lib/audit";
import { serverMutation, workspaceMutation } from "./lib/builders";
import { proposeCrmAction } from "./lib/crm/act";
import { notFound, userError } from "./lib/errors";
import { requireWork } from "./lib/roles";

export const PAGE_TEXT = {
  notApproved: "A person approves the proposal in Approvals before it can be shared.",
  noName: "Type your name to accept.",
} as const;

/** Days without an open before the follow-up is drafted. */
export const NUDGE_DAYS = 3;
const DAY = 86_400_000;

/** Whether payment links can be made on this deployment. Without a Stripe key it is "Not set up yet". */
export function paymentReadiness(): "notSetUp" | "ready" {
  return process.env.STRIPE_SECRET_KEY?.trim() ? "ready" : "notSetUp";
}

export function pageUrl(token: string) {
  return `${appUrl().replace(/\/$/, "")}/p/${token}`;
}

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

/** The email to the lead with the page's link. It names no amount: the page states the price as the offer does. */
export function shareEmail(input: { leadName: string; title: string; packageTitle: string; url: string }) {
  return {
    title: input.title.slice(0, 120),
    body: [`Hi ${firstName(input.leadName)},`, "", `Thank you for the call. Here is the proposal we talked about, for ${input.packageTitle}:`, input.url, "", "It sets out what you told us you need, what is included and the next steps. Reply with any questions."].join("\n"),
  };
}

/** The follow-up when the page was not opened. Written in code: no model, no pressure. */
export function nudgeEmail(input: { leadName: string; sharedAt: number; url: string }) {
  const day = new Date(input.sharedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  return {
    title: "The proposal from our call",
    body: [`Hi ${firstName(input.leadName)},`, "", `I sent the proposal we discussed on ${day}. Here is the link again, in case it was buried:`, input.url, "", "If now is not the right time, tell me and I will leave it there."].join("\n"),
  };
}

async function approved(ctx: Pick<MutationCtx, "db">, row: Doc<"proposals">) {
  if (row.status !== "ready" || !row.view?.checksPassed || !row.assetId) return false;
  const asset = await ctx.db.get(row.assetId);
  return asset?.status === "approved";
}

/** A person shares an approved proposal: the page's link, and the email to the lead filed in Comms for a person. */
export const share = workspaceMutation({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const row = await ctx.db.get(args.proposalId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    ctx.clients.require(row.clientId);
    if (!(await approved(ctx, row))) throw userError(PAGE_TEXT.notApproved);
    const token = row.token ?? newToken();
    const url = pageUrl(token);
    let draftId = row.draftId;
    if (!draftId && row.contactRef) {
      const email = shareEmail({ leadName: row.leadName, title: row.view!.title, packageTitle: row.view!.package.title, url });
      draftId = await fileAgentDraft(ctx, {
        workspaceId: row.workspaceId,
        ...(row.clientId ? { clientId: row.clientId } : {}),
        contactRef: row.contactRef,
        ...(row.dealRef ? { dealRef: row.dealRef } : {}),
        kind: "price",
        channel: "email",
        title: email.title,
        body: email.body,
        why: "The proposal a person approved, sent as a link to its page so you can see when it is opened.",
        trigger: "proposal",
      });
    }
    await ctx.db.patch(row._id, { token, ...(row.sharedAt ? {} : { sharedAt: Date.now(), sharedBy: ctx.identity.subject }), ...(draftId ? { draftId } : {}) });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "proposal.shared", subject: row._id });
    return { url, draftId: draftId ?? null };
  },
});

async function byToken(ctx: Pick<MutationCtx, "db">, token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const row = await ctx.db
    .query("proposals")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  return row && (await approved(ctx, row)) ? row : null;
}

/** What the lead's page shows: the proposal, the business's name, and whether it was accepted. Changes nothing. */
export const page = serverMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const row = await byToken(ctx, args.token);
    if (!row || !row.view) return null;
    const client = row.clientId ? await ctx.db.get(row.clientId) : null;
    const workspace = await ctx.db.get(row.workspaceId);
    const view = row.view;
    return {
      business: client?.name ?? workspace?.name ?? "",
      leadName: row.leadName,
      title: view.title,
      intro: view.intro,
      // The needs only, in Dealmaker's words: the quotes and who said them stay with the team.
      needs: view.needs.map((need) => need.need),
      package: { title: view.package.title, body: view.package.body },
      deliverables: view.deliverables,
      price: { title: view.price.title, body: view.price.body },
      ...(view.guarantee ? { guarantee: { title: view.guarantee.title, body: view.guarantee.body } } : {}),
      proof: view.proof.map((item) => ({ title: item.title, body: item.body })),
      nextSteps: view.nextSteps,
      closing: view.closing,
      acceptedAt: row.acceptedAt ?? null,
      acceptedName: row.acceptedName ?? null,
      payment: paymentReadiness(),
    };
  },
});

/** The page was shown in the lead's browser: counted once per load. */
export const seen = serverMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const row = await byToken(ctx, args.token);
    if (!row) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, { views: (row.views ?? 0) + 1, firstViewedAt: row.firstViewedAt ?? now, lastViewedAt: now });
    return null;
  },
});

/**
 * The lead accepts with their typed name. Recorded once. With a CRM deal, marking it won is proposed; the Owner
 * decides (a hard stop). It is not an e-signature.
 */
export const accept = serverMutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const row = await byToken(ctx, args.token);
    if (!row) notFound();
    const name = args.name.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name) throw userError(PAGE_TEXT.noName);
    if (row.acceptedAt) return { acceptedAt: row.acceptedAt };
    const now = Date.now();
    let wonStep: Doc<"proposals">["wonStep"];
    if (row.dealRef) {
      const scope = { workspaceId: row.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}), agentSlug: SALES_CONVERSION };
      const outcome = await proposeCrmAction(ctx, scope, { kind: "set_status", dealId: row.dealRef, status: "won", why: `Accepted on the proposal page by "${name}".` }, { lead: row.leadName });
      wonStep = outcome.ok ? { state: "proposed", detail: "Marking the deal won waits for the Owner." } : { state: "doItYourself", detail: outcome.doItYourself };
    }
    await ctx.db.patch(row._id, { acceptedAt: now, acceptedName: name, ...(wonStep ? { wonStep } : {}) });
    await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "system", actorId: "proposalPage", action: "proposal.accepted", subject: row._id });
    return { acceptedAt: now };
  },
});

const PAGE = 100;

/** Proposals shared three days ago or more and never opened: one follow-up each, drafted in code, waiting in Comms. */
export const nudges = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db.query("proposals").paginate({ numItems: PAGE, cursor: args.cursor ?? null });
    for (const row of page.page) {
      if (!row.token || !row.sharedAt || row.firstViewedAt || row.acceptedAt || row.nudgedAt || !row.contactRef) continue;
      if (now - row.sharedAt < NUDGE_DAYS * DAY) continue;
      if (!(await approved(ctx, row))) continue;
      const email = nudgeEmail({ leadName: row.leadName, sharedAt: row.sharedAt, url: pageUrl(row.token) });
      const nudgeDraftId = await fileAgentDraft(ctx, {
        workspaceId: row.workspaceId,
        ...(row.clientId ? { clientId: row.clientId } : {}),
        contactRef: row.contactRef,
        ...(row.dealRef ? { dealRef: row.dealRef } : {}),
        kind: "followUp",
        channel: "email",
        title: email.title,
        body: email.body,
        why: `The proposal page was not opened in ${NUDGE_DAYS} days.`,
        trigger: "proposalNotOpened",
      });
      await ctx.db.patch(row._id, { nudgeDraftId, nudgedAt: now });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.proposalPage.nudges, { cursor: page.continueCursor });
    return null;
  },
});
