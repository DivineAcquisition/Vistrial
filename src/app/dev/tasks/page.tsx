import { notFound } from "next/navigation";

import { TasksStory } from "./story";

export const metadata = { title: "Tasks story", robots: { index: false, follow: false } };

/** ?state=busy|empty|member|viewer|inference, ?column=proposed|approved|running|needsYou|done|result (the column a phone opens on), ?dialog=propose|edit|skip|note, ?theme=light|dark. */
export default async function TasksStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : null);
  return <TasksStory state={pick("state") ?? "busy"} theme={pick("theme") ?? "light"} column={pick("column")} dialog={pick("dialog")} />;
}
