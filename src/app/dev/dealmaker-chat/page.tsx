import { notFound } from "next/navigation";

import { DealmakerChatStory } from "./story";

export const metadata = { title: "Dealmaker chat story", robots: { index: false, follow: false } };

/** ?view=new|plan|pick and ?theme=light|dark, for screenshots. */
export default async function DealmakerChatStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <DealmakerChatStory view={pick("view", "plan")} theme={pick("theme", "light")} />;
}
