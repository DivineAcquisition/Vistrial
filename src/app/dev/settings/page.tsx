import { notFound } from "next/navigation";

import { SettingsStory } from "./story";

export const metadata = { title: "Settings story", robots: { index: false, follow: false } };

/**
 * ?section=business|people|agents|data|billing|you opens a group, ?role=owner|manager|rep the role it is
 * seen as, ?support=off and ?profile=open show those states, and ?account=password|setup|codes|on|off|confirm|wrong-code the account cards under You. For screenshots.
 */
export default async function SettingsStoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const pick = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : null);
  return <SettingsStory section={pick("section")} role={pick("role")} support={pick("support") !== "off"} account={pick("account") ?? ""} />;
}
