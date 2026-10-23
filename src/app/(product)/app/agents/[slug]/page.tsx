import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadCatalog } from "@/lib/shell/load-catalog";
import { bodyText } from "@/lib/ui";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const agents = await loadCatalog();
  const agent = agents.find((row) => row.slug === slug);
  return { title: agent?.name ?? "Agent" };
}

export default async function AgentPage({ params }: PageProps) {
  const { slug } = await params;
  const agents = await loadCatalog();
  const agent = agents.find((row) => row.slug === slug);
  if (!agent) notFound();

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader eyebrow="Agent" title={agent.name} description={agent.job} status="Off" statusTone="neutral" />
      <Panel className="grid gap-4 p-6">
        <StatusBadge label="Off" />
        <p className={bodyText}>{agent.promise}</p>
        <p className="text-sm text-muted-foreground">This agent is off. It will not run, and it will not send anything.</p>
      </Panel>
    </div>
  );
}
