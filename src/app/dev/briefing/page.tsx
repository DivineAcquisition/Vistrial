import { notFound } from "next/navigation";

import { BriefingStory } from "./story";

export const metadata = { title: "Briefing story", robots: { index: false, follow: false } };

/** ?state=busy|empty|admin|member|viewer|trends-off, ?kind=approval|draft|weeklyReport|finished|alert|trend, ?theme=light|dark. */
export default async function BriefingStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : null);
  return <BriefingStory state={pick("state") ?? "busy"} theme={pick("theme") ?? "light"} kind={pick("kind")} />;
}
