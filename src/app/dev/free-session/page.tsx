import { notFound } from "next/navigation";

import { FreeSessionStory } from "./story";

export const metadata = { title: "Free session story", robots: { index: false, follow: false } };

/** ?state=starting|working|waiting|report|stopped|paywall|paywall-off opens a state directly, for screenshots. */
export default async function FreeSessionStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <FreeSessionStory state={typeof query.state === "string" ? query.state : "working"} />;
}
