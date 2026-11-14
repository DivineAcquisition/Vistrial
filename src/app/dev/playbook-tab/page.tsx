import { notFound } from "next/navigation";

import { PlaybookTabStory } from "./story";

export const metadata = { title: "Playbook tab story", robots: { index: false, follow: false } };

/** ?state=full|few|empty|viewer (few: two calls, so the objection playbook says Not enough data), ?folder=offer|prospect|objections|closing and ?theme=light|dark, for screenshots. */
export default async function PlaybookTabStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <PlaybookTabStory state={pick("state", "full")} folder={pick("folder", "offer")} theme={pick("theme", "light")} />;
}
