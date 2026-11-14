import { notFound } from "next/navigation";

import { NoteTakersStory } from "./story";

export const metadata = { title: "Note takers story", robots: { index: false, follow: false } };

/** ?view=connected|new and ?theme=light|dark, for screenshots. */
export default async function NoteTakersStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <NoteTakersStory view={pick("view", "connected")} theme={pick("theme", "light")} />;
}
