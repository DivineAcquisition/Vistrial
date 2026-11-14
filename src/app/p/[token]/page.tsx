import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProposalPublic } from "@/components/proposal/proposal-public";
import { readProposalPage } from "@/lib/proposals/server";

import { accept, markSeen } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Proposal", robots: { index: false, follow: false } };

/** The page a lead opens for their proposal. Public by its long random link; it shows only an approved proposal. */
export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proposal = await readProposalPage(token);
  if (!proposal) notFound();
  return <ProposalPublic proposal={proposal} onSeen={markSeen.bind(null, token)} onAccept={accept.bind(null, token)} />;
}
