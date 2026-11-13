import { notFound } from "next/navigation";

import { ModelsStory } from "./story";

export const metadata = { title: "Model switch story", robots: { index: false, follow: false } };

/** The model switch and the model mark in every state, with sample data, for screenshots. */
export default function ModelsStoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ModelsStory />;
}
