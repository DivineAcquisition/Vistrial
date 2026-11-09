import { notFound } from "next/navigation";

import { HomeStory } from "./story";

export const metadata = { title: "Home story", robots: { index: false, follow: false } };

/** ?state=busy|empty|rep and ?theme=light|dark, for screenshots. */
export default async function HomeStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <HomeStory state={pick("state", "busy")} theme={pick("theme", "light")} />;
}
