import { notFound } from "next/navigation";

import { CallsTabStory } from "./story";

export const metadata = { title: "Calls tab story", robots: { index: false, follow: false } };

/** ?state=calls|brief|first|nocrm|viewer|intake|review|reviewMember|reviewProposal|proposal|proposalApproved|linksOn and ?theme=light|dark, for screenshots. */
export default async function CallsTabStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <CallsTabStory state={pick("state", "calls")} theme={pick("theme", "light")} />;
}
