import { notFound } from "next/navigation";

import { OnboardingStory } from "./story";

export const metadata = { title: "Onboarding story", robots: { index: false, follow: false } };

/** ?step=website|connect|confirm and ?site=none|reading|done|failed open a state directly, for screenshots. */
export default async function OnboardingStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  return <OnboardingStory step={pick("step") || "website"} site={pick("site") || "done"} />;
}
