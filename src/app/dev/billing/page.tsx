import { notFound } from "next/navigation";

import { BillingStory } from "./story";

export const metadata = { title: "Billing story", robots: { index: false, follow: false } };

/** ?state=active|low|empty|off opens a state directly, for screenshots. */
export default async function BillingStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  return <BillingStory state={typeof query.state === "string" ? query.state : "active"} />;
}
