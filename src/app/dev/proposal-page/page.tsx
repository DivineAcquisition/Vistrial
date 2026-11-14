import { notFound } from "next/navigation";

import { ProposalPageStory } from "./story";

export const metadata = { title: "Proposal page story", robots: { index: false, follow: false } };

/** ?state=open|accepted|stripe and ?theme=light|dark, for screenshots of the page a lead opens. */
export default async function ProposalPageStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <ProposalPageStory state={pick("state", "open")} theme={pick("theme", "light")} />;
}
