import { notFound } from "next/navigation";

import { ClientsStory } from "./story";

export const metadata = { title: "Clients story", robots: { index: false, follow: false } };

/**
 * The Clients page and the client picker.
 * ?view=page|sidebar, ?state=owner|member|empty, ?open=<client id>|new, ?theme=light|dark. For screenshots.
 */
export default async function ClientsStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <ClientsStory view={pick("view", "page")} state={pick("state", "owner")} open={pick("open", "")} theme={pick("theme", "light")} />;
}
