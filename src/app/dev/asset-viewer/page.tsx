import { notFound } from "next/navigation";

import { AssetViewerStory } from "./story";

export const metadata = { title: "Asset viewer story", robots: { index: false, follow: false } };

export default function AssetViewerStoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AssetViewerStory />;
}
