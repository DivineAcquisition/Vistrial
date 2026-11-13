import { notFound } from "next/navigation";

import { PagesTabStory } from "./story";

export const metadata = { title: "Pages tab story", robots: { index: false, follow: false } };

/** ?state=full|old|noshots|form|running|empty|rep (old: a teardown saved before verdicts and section headlines), ?page=p1|p2|p3 and ?theme=light|dark, for screenshots. */
export default async function PagesTabStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <PagesTabStory state={pick("state", "full")} theme={pick("theme", "light")} pageId={pick("page", "p1")} />;
}
