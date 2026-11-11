import { notFound } from "next/navigation";

import { IntegrationsStory } from "./story";

export const metadata = { title: "Integrations story", robots: { index: false, follow: false } };

/** ?state=none|ready|connected|returned&role=owner|rep&theme=dark opens a state directly, for screenshots. */
export default async function IntegrationsStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const text = (key: string, fallback: string) => (typeof query[key] === "string" ? (query[key] as string) : fallback);
  return <IntegrationsStory state={text("state", "none")} role={text("role", "owner")} theme={text("theme", "light")} />;
}
