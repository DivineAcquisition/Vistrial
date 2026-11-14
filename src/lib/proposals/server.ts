import "server-only";

/**
 * The lead's proposal page talks to Convex only from Vistrial's web server, with the page secret shared with the
 * Convex deployment (PUBLIC_FORM_SECRET, as public forms do). The lead's browser never holds the secret.
 */

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";

export type ProposalPage = NonNullable<Awaited<ReturnType<typeof readProposalPage>>>;

function client() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  const secret = process.env.PUBLIC_FORM_SECRET?.trim();
  if (!url || !secret) return null;
  return { convex: new ConvexHttpClient(url), secret };
}

/** The proposal behind a page token, or null when it does not exist, is not approved, or the page is not set up. */
export async function readProposalPage(token: string) {
  const setup = client();
  if (!setup || !/^[0-9a-f]{48}$/.test(token)) return null;
  try {
    return await setup.convex.mutation(api.proposalPage.page, { secret: setup.secret, token });
  } catch {
    return null;
  }
}

export async function recordProposalSeen(token: string) {
  const setup = client();
  if (!setup) return;
  try {
    await setup.convex.mutation(api.proposalPage.seen, { secret: setup.secret, token });
  } catch {
    // An open that could not be counted never breaks the page.
  }
}

export async function acceptProposal(token: string, name: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const setup = client();
  if (!setup) return { ok: false, message: "This page cannot take an answer right now. Reply to the email instead." };
  try {
    await setup.convex.mutation(api.proposalPage.accept, { secret: setup.secret, token, name });
    return { ok: true };
  } catch (error) {
    const data = (error as { data?: { message?: string } }).data;
    return { ok: false, message: data?.message ?? "Your answer was not saved. Try again, or reply to the email." };
  }
}
