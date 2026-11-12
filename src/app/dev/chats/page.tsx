import { notFound } from "next/navigation";

import { ChatsStory } from "./story";

export const metadata = { title: "Chats story", robots: { index: false, follow: false } };

/** ?state=busy|mine|empty|viewer, ?theme=light|dark. Library > Chats. */
export default async function ChatsStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : null);
  return <ChatsStory state={pick("state") ?? "busy"} theme={pick("theme") ?? "light"} />;
}
