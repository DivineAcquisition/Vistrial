import { notFound } from "next/navigation";

import { OutcomeLoopStory } from "./story";

export const metadata = { title: "Outcome loop story", robots: { index: false, follow: false } };

export default function OutcomeLoopStoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <OutcomeLoopStory />;
}
