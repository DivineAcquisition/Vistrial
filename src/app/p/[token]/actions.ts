"use server";

import { acceptProposal, recordProposalSeen } from "@/lib/proposals/server";

/** Counts one open of the lead's page, from the browser that shows it (link previews and crawlers do not run it). */
export async function markSeen(token: string) {
  await recordProposalSeen(token);
}

/** The lead accepts with their typed name. Not a signature. */
export async function accept(token: string, name: string) {
  return acceptProposal(token, name);
}
