import { notFound } from "next/navigation";

import { AuthPagesStory } from "./story";

export const metadata = { title: "Auth pages story", robots: { index: false, follow: false } };

/**
 * Every sign-in and sign-up step with no Clerk behind it, for screenshots and for looking at a step
 * without an account in that state. ?screen=sign-in|sign-up, ?step=<name>, ?problem=<name>, ?theme=dark.
 * With no step it lists them all.
 */
export default async function AuthPagesStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  return <AuthPagesStory screen={pick("screen")} step={pick("step")} problem={pick("problem")} theme={pick("theme")} />;
}
