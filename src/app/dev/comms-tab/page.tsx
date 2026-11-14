import { notFound } from "next/navigation";

import { CommsTabStory } from "./story";

export const metadata = {
  title: "Comms tab story",
  robots: { index: false, follow: false },
};

/** ?lane=drafted|held|waiting|sent|failed, ?messaging=on|off and ?theme=light|dark, for screenshots. */
export default async function CommsTabStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <CommsTabStory messaging={pick("messaging", "on") === "on"} theme={pick("theme", "light")} />;
}
