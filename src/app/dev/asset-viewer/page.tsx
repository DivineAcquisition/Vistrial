import { notFound } from "next/navigation";

import { AssetViewerStory } from "./story";

export const metadata = { title: "Asset viewer story", robots: { index: false, follow: false } };

/** ?theme=light|dark, for screenshots. */
export default async function AssetViewerStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <AssetViewerStory theme={query.theme === "dark" ? "dark" : "light"} />;
}
