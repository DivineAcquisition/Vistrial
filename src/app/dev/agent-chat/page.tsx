import { notFound } from "next/navigation";

import { AgentChatStory } from "./story";

export const metadata = { title: "Agent chat story", robots: { index: false, follow: false } };

/** ?state=new|research|context|unclear|plan|finished|empty|rep and ?theme=light|dark, for screenshots. */
export default async function AgentChatStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <AgentChatStory state={pick("state", "new")} theme={pick("theme", "light")} />;
}
