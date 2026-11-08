import { notFound } from "next/navigation";

import { MetaConnectionStory } from "./story";

export const metadata = { title: "Meta connection story", robots: { index: false, follow: false } };

/** ?state=none|accounts|connected|syncing|reconnect opens a state directly, for screenshots. */
export default async function MetaConnectionStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <MetaConnectionStory state={typeof query.state === "string" ? query.state : "connected"} />;
}
