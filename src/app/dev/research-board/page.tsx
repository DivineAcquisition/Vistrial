import { notFound } from "next/navigation";

import { ResearchBoardStory } from "./story";

export const metadata = { title: "Research Board story", robots: { index: false, follow: false } };

export default async function ResearchBoardStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const focus = typeof query.focus === "string" ? query.focus.split(",").filter(Boolean) : [];
  return <ResearchBoardStory width={typeof query.width === "string" ? query.width : undefined} focus={focus} />;
}
