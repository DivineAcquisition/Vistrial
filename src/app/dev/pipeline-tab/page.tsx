import { notFound } from "next/navigation";

import { PipelineTabStory } from "./story";

export const metadata = { title: "Pipeline tab story", robots: { index: false, follow: false } };

/** ?view=owner|closer and ?theme=light|dark, for screenshots. */
export default async function PipelineTabStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <PipelineTabStory view={pick("view", "owner")} theme={pick("theme", "light")} />;
}
