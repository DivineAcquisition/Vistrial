import { notFound } from "next/navigation";

import { ChatStory } from "./story";

export const metadata = { title: "Chat box story", robots: { index: false, follow: false } };

/** The chat box and follow-up turns with sample data, for screenshots. */
export default function ChatStoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ChatStory />;
}
