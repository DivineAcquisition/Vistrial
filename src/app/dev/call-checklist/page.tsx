import { notFound } from "next/navigation";

import { CallChecklistStory } from "./story";

export const metadata = { title: "Call checklist story", robots: { index: false, follow: false } };

/** ?state=full|ticked|empty|viewer and ?theme=light|dark, for screenshots. */
export default async function CallChecklistStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <CallChecklistStory state={pick("state", "full")} theme={pick("theme", "light")} />;
}
