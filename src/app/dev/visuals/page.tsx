import { notFound } from "next/navigation";

import { VisualsStory } from "./story";

export const metadata = { title: "Visuals story", robots: { index: false, follow: false } };

/** Empty states, status tags, banners and motion in one place, for screenshots. ?part=empty|tags|banners */
export default async function VisualsStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <VisualsStory part={typeof query.part === "string" ? query.part : "all"} />;
}
