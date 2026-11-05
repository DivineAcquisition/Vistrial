import { notFound } from "next/navigation";

import { ResearchStudioStory } from "./story";

export const metadata = { title: "Research Studio story", robots: { index: false, follow: false } };

/** ?state=review&width=390 opens a state directly, for screenshots. */
export default async function ResearchStudioStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (name: string) => (typeof query[name] === "string" ? (query[name] as string) : undefined);
  return <ResearchStudioStory initialState={pick("state")} initialWidth={pick("width")} initialSection={pick("section")} />;
}
