import { notFound } from "next/navigation";

import { OrganizationsStory } from "./story";

export const metadata = { title: "Organizations story", robots: { index: false, follow: false } };

/**
 * The organization selector at the top of the sidebar.
 * ?state=one|several|member|closed, ?theme=light|dark, ?open=menu|add to show the menu or the dialog. For screenshots.
 */
export default async function OrganizationsStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <OrganizationsStory state={pick("state", "several")} theme={pick("theme", "light")} />;
}
