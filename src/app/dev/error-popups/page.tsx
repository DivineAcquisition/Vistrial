import { notFound } from "next/navigation";

import { ErrorPopupsStory } from "./story";

export const metadata = { title: "Error pop-ups story", robots: { index: false, follow: false } };

export default function ErrorPopupsStoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ErrorPopupsStory />;
}
