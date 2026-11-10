import { notFound } from "next/navigation";

import { CreativeTabStory } from "./story";

export const metadata = { title: "Creative tab story", robots: { index: false, follow: false } };

/** ?state=full|review|empty|rep|form|running|approved|due|won and ?theme=light|dark, for screenshots. */
export default async function CreativeTabStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <CreativeTabStory state={pick("state", "full")} theme={pick("theme", "light")} />;
}
