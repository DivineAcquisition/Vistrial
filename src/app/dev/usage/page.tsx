import { notFound } from "next/navigation";

import { UsageStory } from "./story";

export const metadata = { title: "Usage story", robots: { index: false, follow: false } };

/** ?state=agency|admin|member|coach|coach-member|viewer|low|empty opens a state directly, ?theme=light|dark. For screenshots. */
export default async function UsageStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <UsageStory state={typeof query.state === "string" ? query.state : "agency"} theme={typeof query.theme === "string" ? query.theme : "light"} />;
}
