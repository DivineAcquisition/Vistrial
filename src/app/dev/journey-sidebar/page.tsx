import { notFound } from "next/navigation";

import { JourneySidebarStory } from "./story";

export const metadata = { title: "Sidebar story", robots: { index: false, follow: false } };

/** ?state=busy|empty|rep, ?theme=light|dark, ?path=/app/... for screenshots. */
export default async function JourneySidebarStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <JourneySidebarStory state={pick("state", "busy")} theme={pick("theme", "light")} path={pick("path", "/app")} />;
}
