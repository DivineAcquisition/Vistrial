import { notFound } from "next/navigation";

import { ChatPanelStory } from "./story";

export const metadata = { title: "Chat panel story", robots: { index: false, follow: false } };

/** ?state=new|asking|ready|started|viewer|plain, ?theme=light|dark. The side chat panel beside the Tasks board. */
export default async function ChatPanelStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : null);
  return <ChatPanelStory state={pick("state") ?? "new"} theme={pick("theme") ?? "light"} />;
}
