import { notFound } from "next/navigation";

import { AgentSessionStory } from "./story";

export const metadata = { title: "Agent session story", robots: { index: false, follow: false } };

/** ?state=done|review|waiting|working opens a state directly, for screenshots. */
export default async function AgentSessionStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <AgentSessionStory state={typeof query.state === "string" ? query.state : "done"} />;
}
