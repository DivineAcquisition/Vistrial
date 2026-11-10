import { notFound } from "next/navigation";

import { AgentOverviewStory } from "./story";

export const metadata = { title: "Agent overview story", robots: { index: false, follow: false } };

/** ?state=full|empty|rep and ?theme=light|dark, for screenshots. */
export default async function AgentOverviewStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <AgentOverviewStory state={pick("state", "full")} theme={pick("theme", "light")} />;
}
