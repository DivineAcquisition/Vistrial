import { notFound } from "next/navigation";

import { DealmakerHomeStory } from "./story";

export const metadata = { title: "Dealmaker home story", robots: { index: false, follow: false } };

/** ?state=off|on|member (shown as a Viewer) and ?theme=light|dark, for screenshots. */
export default async function DealmakerHomeStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <DealmakerHomeStory state={pick("state", "off")} theme={pick("theme", "light")} />;
}
