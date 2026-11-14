import { notFound } from "next/navigation";

import { CalendarTabStory } from "./story";

export const metadata = { title: "Calendar tab story", robots: { index: false, follow: false } };

/** ?view=week|empty|auto and ?theme=light|dark, for screenshots. */
export default async function CalendarTabStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <CalendarTabStory view={pick("view", "week")} theme={pick("theme", "light")} />;
}
