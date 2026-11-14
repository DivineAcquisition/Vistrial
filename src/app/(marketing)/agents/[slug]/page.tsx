import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentLanding } from "@/components/marketing/agent-page";
import { MarketingShell } from "@/components/marketing/chrome";
import { AGENT_PAGES, agentPageFor } from "@/lib/marketing/agent-pages";
import { publicPageMetadata } from "@/lib/seo";

/** One page per agent that has one; any other address is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return AGENT_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = agentPageFor(slug);
  if (!page) return {};
  return publicPageMetadata({ title: page.seo.title, description: page.seo.description, path: `/agents/${page.slug}` });
}

export default async function AgentPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = agentPageFor(slug);
  if (!page) notFound();
  return (
    <MarketingShell>
      <article>
        <AgentLanding page={page} />
      </article>
    </MarketingShell>
  );
}
