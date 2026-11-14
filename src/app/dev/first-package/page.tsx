import { notFound } from "next/navigation";

import { FirstPackageStory } from "./story";

export const metadata = { title: "First package story", robots: { index: false, follow: false } };

/** ?state=running|done|review|waiting, for screenshots. */
export default async function FirstPackageStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <FirstPackageStory state={typeof query.state === "string" ? query.state : "running"} />;
}
