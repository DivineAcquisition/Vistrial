import { notFound } from "next/navigation";

import { ResearchTabStory } from "./story";

export const metadata = { title: "Research tab story", robots: { index: false, follow: false } };

/** ?state=full|empty|rep and ?theme=light|dark, for screenshots. */
export default async function ResearchTabStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <ResearchTabStory state={pick("state", "full")} theme={pick("theme", "light")} />;
}
