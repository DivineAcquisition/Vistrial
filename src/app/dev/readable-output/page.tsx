import { notFound } from "next/navigation";

import { ReadableOutputStory } from "./story";

export const metadata = { title: "Readable output story", robots: { index: false, follow: false } };

/** ?coverage=grid|list|track, ?marks=underline|tag, ?next=sticky|inline, ?page=p1|p2|p3 and ?theme=light|dark, for screenshots. */
export default async function ReadableOutputStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <ReadableOutputStory theme={pick("theme", "light")} coverage={pick("coverage", "grid")} marks={pick("marks", "underline")} next={pick("next", "sticky")} pageId={pick("page", "p1")} />;
}
