import { notFound } from "next/navigation";

import { BrowserAccessStory } from "./story";

export const metadata = { title: "Browser access story", robots: { index: false, follow: false } };

/** ?state=approve|restricted|done|blocked|signin|none|manager|rep and ?theme=light|dark, for screenshots. */
export default async function BrowserAccessStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <BrowserAccessStory state={pick("state", "approve")} theme={pick("theme", "light")} />;
}
