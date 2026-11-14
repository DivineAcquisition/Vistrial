import { notFound } from "next/navigation";

import { LandingPageStory } from "./story";

export const metadata = { title: "Landing page story", robots: { index: false, follow: false } };

/** ?state=approved|review, for screenshots. */
export default async function LandingPageStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <LandingPageStory state={typeof query.state === "string" ? query.state : "approved"} />;
}
