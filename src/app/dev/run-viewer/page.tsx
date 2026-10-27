import { notFound } from "next/navigation";

import { RunViewerStory } from "./story";

export const metadata = { title: "Run viewer story", robots: { index: false, follow: false } };

export default function RunViewerStoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RunViewerStory />;
}
