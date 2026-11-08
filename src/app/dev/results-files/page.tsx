import { notFound } from "next/navigation";

import { ResultsFilesStory } from "./story";

export const metadata = { title: "Results files story", robots: { index: false, follow: false } };

export default function ResultsFilesStoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ResultsFilesStory />;
}
