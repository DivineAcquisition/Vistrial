import { notFound } from "next/navigation";

import { HighLevelConnectionStory } from "./story";

export const metadata = { title: "HighLevel connection story", robots: { index: false, follow: false } };

/**
 * ?state=none|notsetup|admin|connected|reading|reconnect|ratelimited|slot|slot-connected|acting-off|acting|acting-admin opens a state
 * directly, for screenshots.
 */
export default async function HighLevelConnectionStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <HighLevelConnectionStory state={typeof query.state === "string" ? query.state : "connected"} />;
}
