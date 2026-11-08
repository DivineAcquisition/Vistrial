import { notFound } from "next/navigation";

import { IntakeChatStory } from "./story";

export const metadata = { title: "Intake chat story", robots: { index: false, follow: false } };

/** ?state=new|question|remember|plan opens a state directly, for screenshots. */
export default async function IntakeChatStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <IntakeChatStory state={typeof query.state === "string" ? query.state : "plan"} />;
}
